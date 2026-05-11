import { config } from 'dotenv'
config({ path: '.env.local' })
config({ path: '.env' })
import mongoose from 'mongoose'
await mongoose.connect(process.env.MONGODB_URI)
const db = mongoose.connection.db

const uid = new mongoose.Types.ObjectId('69fd2cc8f0b26368f3e57411')
const subId = new mongoose.Types.ObjectId('69fde0f4c92203fa8859ee2a')

const user = await db.collection('users').findOne({ _id: uid })
console.log('\n=== USER ===')
console.log(JSON.stringify({
  _id: user._id, email: user.email, name: user.name, role: user.role,
  hasPassword: !!user.password, magicLinkToken: user.magicLinkToken,
  magicLinkExpires: user.magicLinkExpires, emailVerified: user.emailVerified,
  createdAt: user.createdAt, creditoDisponible: user.creditoDisponible,
}, null, 2))

const sub = await db.collection('subscriptions').findOne({ _id: subId })
console.log('\n=== SUBSCRIPTION ACTIVA ===')
console.log(JSON.stringify(sub, null, 2))

const subCancel = await db.collection('subscriptions').findOne({ _id: new mongoose.Types.ObjectId('69fd2cc9f0b26368f3e5741d') })
console.log('\n=== SUBSCRIPTION CANCELADA (inicial) ===')
console.log(JSON.stringify(subCancel, null, 2))

console.log('\n=== PaymentBreakdowns del student ===')
const bds = await db.collection('paymentbreakdowns').find({ studentId: uid }).toArray()
bds.forEach(b => console.log(JSON.stringify(b, null, 2)))

console.log('\n=== Bookings del student ===')
const bks = await db.collection('bookings').find({ studentId: uid }).toArray()
console.log(`Total: ${bks.length}`)
bks.forEach(b => console.log(`  ${b._id} sub=${b.subscriptionId} slot=${b.slotId} fecha=${b.fecha} estado=${b.estado}`))

if (sub) {
  console.log('\n=== Workshop del sub ===')
  const w = await db.collection('workshops').findOne({ _id: sub.workshopId })
  console.log(JSON.stringify({
    _id: w._id, titulo: w.titulo, slug: w.slug, modeloAcceso: w.modeloAcceso,
    ownerId: w.ownerId, plan: w.plan, slotsCount: w.slots?.length,
    politica: w.politica,
  }, null, 2))
  if (w.slots?.length) {
    console.log(`Primeros 5 slots:`)
    w.slots.slice(0, 5).forEach(s => console.log(`  ${s._id} fechaInicio=${s.fechaInicio} cupoMax=${s.cupoMax} cupoDisponible=${s.cupoDisponible} activo=${s.activo}`))
  }
}

console.log('\n=== FinanceAuditLog del student/sub ===')
const logs = await db.collection('financeauditlogs').find({
  $or: [{ 'metadata.studentId': uid.toString() }, { entidadId: subId }, { 'metadata.subscriptionId': subId.toString() }]
}).toArray()
logs.forEach(l => console.log(`  ${l.createdAt} accion=${l.accion} entidad=${l.entidadTipo}/${l.entidadId}`))

await mongoose.disconnect()
