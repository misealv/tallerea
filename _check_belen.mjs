import 'dotenv/config'
import mongoose from 'mongoose'

const fmtCLP = n => '$' + Number(n || 0).toLocaleString('es-CL')

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db
  const regex = /belen|belén|opazo/i

  const users = await db.collection('users').find({
    $or: [{ name: regex }, { email: regex }]
  }).toArray()

  console.log(`\n=== Usuarios (${users.length}) ===`)
  for (const u of users) {
    console.log(`\n  ${u.name} <${u.email}>`)
    console.log(`    _id=${u._id}  role=${u.role}  hasPassword=${!!u.password}  createdAt=${u.createdAt?.toISOString?.() ?? u.createdAt}`)
    if (u.dependents?.length) {
      console.log(`    Dependientes (${u.dependents.length}):`)
      u.dependents.forEach(d => {
        console.log(`      - ${d.nombre}  activo=${d.activo}  _id=${d._id}  fechaNac=${d.fechaNacimiento ?? 'n/d'}`)
      })
    } else {
      console.log(`    Sin dependientes`)
    }
  }

  if (!users.length) {
    console.log('No se encontraron usuarios con ese nombre/email.')
    await mongoose.disconnect()
    return
  }

  const userIds = users.map(u => u._id)

  console.log(`\n=== Subscriptions ===`)
  const subs = await db.collection('subscriptions').find({ studentId: { $in: userIds } }).sort({ createdAt: -1 }).toArray()
  console.log(`Total: ${subs.length}`)
  for (const s of subs) {
    const w = await db.collection('workshops').findOne({ _id: s.workshopId }, { projection: { titulo: 1, slug: 1 } })
    console.log(`\n  [${s.estado}] ${w?.titulo ?? '???'}  (sub _id=${s._id})`)
    console.log(`    Menor: ${s.dependentNombreSnapshot ?? '— (apoderado mismo)'}  dependentId=${s.dependentId ?? '—'}`)
    console.log(`    Monto: ${fmtCLP(s.monto)}  precioEspecial=${s.precioEspecial}  precioSnapshot=${s.precioSnapshot ?? '—'}`)
    console.log(`    Origen: ${s.origenInscripcion}  inscritoPor=${s.inscritoPor ?? '—'}`)
    console.log(`    Sesiones: ${s.sesionesUsadas}/${s.sesionesTotales}  disponibles=${s.sesionesDisponibles}`)
    console.log(`    fechaCompra=${s.fechaCompra?.toISOString?.()}  fechaVenc=${s.fechaVencimiento?.toISOString?.()}`)
    console.log(`    pagoRef=${s.pagoRef ?? '—'}  paymentBreakdownId=${s.paymentBreakdownId ?? '—'}`)
    if (s.clasesPrepagadas?.cantidad) {
      const cp = s.clasesPrepagadas
      console.log(`    Prepagadas: ${cp.consumidas}/${cp.cantidad}  fechaPago=${cp.fechaPago?.toISOString?.() ?? '— (pendiente)'}  metodo=${cp.metodoPago ?? '—'}  caduca=${cp.caducaEn?.toISOString?.() ?? '—'}`)
    }
    if (s.notaPrecioEspecial) console.log(`    Nota: ${s.notaPrecioEspecial}`)
  }

  console.log(`\n=== Enrollments ===`)
  const enrolls = await db.collection('enrollments').find({ studentId: { $in: userIds } }).sort({ createdAt: -1 }).toArray()
  console.log(`Total: ${enrolls.length}`)
  for (const e of enrolls) {
    const w = await db.collection('workshops').findOne({ _id: e.workshopId }, { projection: { titulo: 1 } })
    console.log(`  [${e.estado}] ${w?.titulo ?? '???'} — ${fmtCLP(e.monto)}  menor=${e.dependentNombreSnapshot ?? '—'}  origen=${e.origenInscripcion}  pagoRef=${e.pagoRef ?? '—'}`)
  }

  console.log(`\n=== PaymentBreakdowns ===`)
  const pbs = await db.collection('paymentbreakdowns').find({ studentId: { $in: userIds } }).sort({ createdAt: -1 }).toArray()
  console.log(`Total: ${pbs.length}`)
  for (const p of pbs) {
    console.log(`  [${p.estado}] ${p.tipo}  bruto=${fmtCLP(p.montoBruto)}  fee=${fmtCLP(p.feeTallerea)}  prof=${fmtCLP(p.montoProfesor)}  mpId=${p.mercadoPagoId}  fecha=${p.fechaCobro?.toISOString?.()}`)
  }

  await mongoose.disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
