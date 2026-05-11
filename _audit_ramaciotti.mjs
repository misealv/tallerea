import 'dotenv/config'
import mongoose from 'mongoose'

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI no definido')
  await mongoose.connect(uri)
  const db = mongoose.connection.db

  // Buscar por nombre/email parcial
  const regex = /ramaci|ramacci/i
  const users = await db.collection('users').find({
    $or: [{ name: regex }, { email: regex }]
  }).toArray()

  console.log(`\n=== Usuarios encontrados (regex ramaci): ${users.length} ===`)
  users.forEach(u => {
    console.log(`  _id=${u._id} email=${u.email} name=${u.name} role=${u.role} createdAt=${u.createdAt} hasPassword=${!!u.password} hasMagicToken=${!!u.magicLinkToken} magicExp=${u.magicLinkExpires}`)
  })

  // Buscar Subscriptions/Enrollments/PaymentBreakdowns con datos del comprador en pagoRef o por email candidato
  console.log('\n=== Buscando en PaymentBreakdown por payerEmail/buyerEmail con regex ===')
  const breakdowns = await db.collection('paymentbreakdowns').find({
    $or: [
      { payerEmail: regex },
      { buyerEmail: regex },
      { 'metadata.payerEmail': regex },
      { 'metadata.email': regex },
    ]
  }).toArray()
  console.log(`Encontrados: ${breakdowns.length}`)
  breakdowns.forEach(b => {
    console.log(`  _id=${b._id} mpId=${b.mercadoPagoId || b.mpPaymentId} tipo=${b.tipo} estado=${b.estado} monto=${b.montoBruto} studentId=${b.studentId} createdAt=${b.createdAt}`)
    console.log(`    payerEmail=${b.payerEmail || b.buyerEmail || b.metadata?.payerEmail || b.metadata?.email}`)
  })

  console.log('\n=== Buscando Subscriptions pendiente_pago recientes (últimas 30 días) ===')
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const subs = await db.collection('subscriptions').find({
    createdAt: { $gte: since }
  }).sort({ createdAt: -1 }).limit(50).toArray()
  console.log(`Total recientes: ${subs.length}`)
  for (const s of subs) {
    const stu = await db.collection('users').findOne({ _id: s.studentId })
    console.log(`  sub=${s._id} estado=${s.estado} pagoRef=${s.pagoRef || '-'} monto=${s.monto} studentId=${s.studentId} email=${stu?.email} name=${stu?.name} createdAt=${s.createdAt}`)
  }

  console.log('\n=== Buscando Enrollments recientes pendientes/pagados ===')
  const enrolls = await db.collection('enrollments').find({
    createdAt: { $gte: since }
  }).sort({ createdAt: -1 }).limit(50).toArray()
  console.log(`Total: ${enrolls.length}`)
  for (const e of enrolls) {
    const stu = await db.collection('users').findOne({ _id: e.studentId })
    console.log(`  enr=${e._id} estado=${e.estado} pagoRef=${e.pagoRef || '-'} monto=${e.monto} studentId=${e.studentId} email=${stu?.email} name=${stu?.name} createdAt=${e.createdAt}`)
  }

  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
