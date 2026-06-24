import 'dotenv/config'
import mongoose from 'mongoose'

const fmtCLP = n => '$' + Number(n || 0).toLocaleString('es-CL')
const fmtDate = d => d ? new Date(d).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const MP_PAYMENT_ID = '161457319359'

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db

  console.log(`\n━━━ Búsqueda por mpPaymentId="${MP_PAYMENT_ID}" en TODAS las colecciones ━━━`)
  const fields = ['mercadoPagoId', 'mpPaymentId', 'paymentId', 'pagoRef', 'externalReference']
  const cols = ['paymentbreakdowns', 'enrollments', 'subscriptions', 'manualpaymentrecords', 'financeauditlogs']
  for (const c of cols) {
    const exists = await db.listCollections({ name: c }).toArray()
    if (!exists.length) continue
    const orQuery = fields.map(f => ({ [f]: MP_PAYMENT_ID }))
    const docs = await db.collection(c).find({ $or: orQuery }).toArray()
    if (docs.length) console.log(`  ✅ ${c}: ${docs.length}  →  _ids=${docs.map(d => d._id).join(', ')}`)
    else console.log(`  ✗ ${c}: 0`)
  }

  console.log('\n━━━ Buscar usuarios con email parecido a diegolas.bass / Diego Alberto ━━━')
  const users = await db.collection('users').find({
    $or: [
      { email: /diegolas\.bass/i },
      { email: /diegoangulo/i },
      { name: /diego\s+(alberto\s+)?angulo/i }
    ]
  }).toArray()
  users.forEach(u => console.log(`  ${u.name} <${u.email}> _id=${u._id}  rol=${u.role}  taller=${u.taller?.estado ?? '—'}  createdAt=${fmtDate(u.createdAt)}`))

  console.log('\n━━━ Workshop "Programa de iniciación musical al Piano" — paquetes ━━━')
  const ws = await db.collection('workshops').findOne({ _id: new mongoose.Types.ObjectId('69ebee808d91b3d64fccc6b1') })
  if (ws?.paquetes?.length) {
    ws.paquetes.forEach(p => console.log(`  [${p._id}] "${p.nombre}"  ${fmtCLP(p.precio)}  ${p.sesionesIncluidas} sesiones / ${p.duracionDias} días  activo=${p.activo}`))
  } else {
    console.log('  Sin paquetes configurados')
  }
  console.log(`  precioModalidad=${ws?.precioModalidad}  modeloAcceso=${ws?.modeloAcceso}  estado=${ws?.estado}`)

  console.log('\n━━━ Eventos del 2-jun-2026 (cualquier escritura financiera ese día) ━━━')
  const dStart = new Date('2026-06-02T00:00:00-04:00')
  const dEnd = new Date('2026-06-03T12:00:00-04:00')
  for (const c of ['paymentbreakdowns', 'subscriptions', 'enrollments', 'financeauditlogs', 'manualpaymentrecords']) {
    const exists = await db.listCollections({ name: c }).toArray()
    if (!exists.length) continue
    const docs = await db.collection(c).find({ createdAt: { $gte: dStart, $lte: dEnd } }).sort({ createdAt: 1 }).toArray()
    if (!docs.length) continue
    console.log(`\n  → ${c}: ${docs.length}`)
    docs.forEach(d => {
      const summary = c === 'paymentbreakdowns'
        ? `${fmtCLP(d.montoBruto)}  mp=${d.mercadoPagoId ?? d.mpPaymentId ?? '—'}  studentId=${d.studentId}`
        : c === 'subscriptions'
          ? `estado=${d.estado} ${fmtCLP(d.monto)}  studentId=${d.studentId}  pagoRef=${d.pagoRef ?? '—'}`
          : `${d.accion ?? d.estado ?? ''}  ${fmtCLP(d.monto ?? d.montoNuevo)}`
      console.log(`     [${fmtDate(d.createdAt)}] ${summary}`)
    })
  }

  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
