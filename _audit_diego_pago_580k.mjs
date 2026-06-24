import 'dotenv/config'
import mongoose from 'mongoose'

const fmtCLP = n => '$' + Number(n || 0).toLocaleString('es-CL')
const fmtDate = d => d ? new Date(d).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—'

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db

  const diego = await db.collection('users').findOne({ email: 'diegoanguloq@gmail.com' })
  console.log(`\n👤 Diego: ${diego?.name} <${diego?.email}>  _id=${diego?._id}`)
  const diegoId = diego?._id

  // Buscar TODO lo asociado a Diego en colecciones financieras
  const collections = ['paymentbreakdowns', 'enrollments', 'subscriptions', 'creditstransactions', 'financeauditlogs', 'manualpaymentrecords']
  for (const c of collections) {
    try {
      const exists = await db.listCollections({ name: c }).toArray()
      if (!exists.length) continue
    } catch {}
  }

  console.log('\n━━━ PaymentBreakdowns de Diego ━━━')
  const pbs = await db.collection('paymentbreakdowns').find({
    $or: [{ studentId: diegoId }, { buyerId: diegoId }, { userId: diegoId }]
  }).sort({ createdAt: -1 }).toArray()
  console.log(`Total: ${pbs.length}`)
  pbs.forEach(p => {
    console.log(`  [${fmtDate(p.createdAt)}] ${fmtCLP(p.montoBruto)} bruto / prof=${fmtCLP(p.montoProfesor)} / fee=${fmtCLP(p.feeTallerea)}  mpId=${p.mpPaymentId}  tipo=${p.tipo}  workshopId=${p.workshopId}`)
  })

  console.log('\n━━━ Enrollments de Diego ━━━')
  const enrolls = await db.collection('enrollments').find({ studentId: diegoId }).sort({ createdAt: -1 }).toArray()
  console.log(`Total: ${enrolls.length}`)
  enrolls.forEach(e => {
    console.log(`  [${fmtDate(e.createdAt)}] estado=${e.estado} ${fmtCLP(e.montoPagado)}  mpId=${e.mpPaymentId}  workshopId=${e.workshopId}`)
  })

  console.log('\n━━━ TODAS las Subscriptions de Diego ━━━')
  const subs = await db.collection('subscriptions').find({ studentId: diegoId }).sort({ createdAt: -1 }).toArray()
  subs.forEach(s => {
    console.log(`  [${fmtDate(s.createdAt)}] estado=${s.estado} ${fmtCLP(s.monto)} sess=${s.sesionesTotales}  pagoRef=${s.pagoRef ?? '—'}  mpPaymentId=${s.mpPaymentId ?? '—'}  workshopId=${s.workshopId}`)
  })

  console.log('\n━━━ Búsqueda GLOBAL: cualquier doc con monto 580000 (últimos 30 días) ━━━')
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  for (const c of ['paymentbreakdowns', 'enrollments', 'subscriptions', 'manualpaymentrecords']) {
    const exists = await db.listCollections({ name: c }).toArray()
    if (!exists.length) continue
    const docs = await db.collection(c).find({
      $and: [
        { createdAt: { $gte: since } },
        { $or: [{ montoBruto: 580000 }, { monto: 580000 }, { montoPagado: 580000 }, { precio: 580000 }, { amount: 580000 }] }
      ]
    }).limit(20).toArray()
    if (docs.length) {
      console.log(`\n  → ${c}: ${docs.length} match(es)`)
      docs.forEach(d => console.log(`    _id=${d._id}  studentId=${d.studentId}  estado=${d.estado}  createdAt=${fmtDate(d.createdAt)}`))
    }
  }

  console.log('\n━━━ ManualPaymentRecords de Diego ━━━')
  const mprExists = await db.listCollections({ name: 'manualpaymentrecords' }).toArray()
  if (mprExists.length) {
    const mprs = await db.collection('manualpaymentrecords').find({
      $or: [{ studentId: diegoId }, { userId: diegoId }, { buyerId: diegoId }]
    }).sort({ createdAt: -1 }).toArray()
    console.log(`Total: ${mprs.length}`)
    mprs.forEach(m => console.log(`  [${fmtDate(m.createdAt)}] ${fmtCLP(m.monto)}  metodo=${m.metodoPago}  estado=${m.estado}  workshopId=${m.workshopId}`))
  }

  console.log('\n━━━ FinanceAuditLog últimos eventos relacionados a Diego ━━━')
  const auditExists = await db.listCollections({ name: 'financeauditlogs' }).toArray()
  if (auditExists.length) {
    const logs = await db.collection('financeauditlogs').find({
      $or: [{ userId: diegoId }, { 'metadata.studentId': diegoId }, { 'metadata.email': 'diegoanguloq@gmail.com' }]
    }).sort({ createdAt: -1 }).limit(30).toArray()
    console.log(`Total: ${logs.length}`)
    logs.forEach(l => console.log(`  [${fmtDate(l.createdAt)}] ${l.accion}  ${l.entidadTipo}=${l.entidadId}  ${fmtCLP(l.montoNuevo)}`))
  }

  // Últimos 5 días de PaymentBreakdowns globales para ver si llegó algo el día del pago
  console.log('\n━━━ Últimos 10 PaymentBreakdowns globales (cualquier estudiante) ━━━')
  const recent = await db.collection('paymentbreakdowns').find({}).sort({ createdAt: -1 }).limit(10).toArray()
  recent.forEach(p => console.log(`  [${fmtDate(p.createdAt)}] ${fmtCLP(p.montoBruto)}  studentId=${p.studentId}  mpId=${p.mpPaymentId}  ws=${p.workshopId}`))

  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
