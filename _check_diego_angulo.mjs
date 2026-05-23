import 'dotenv/config'
import mongoose from 'mongoose'

const fmtCLP = n => '$' + Number(n || 0).toLocaleString('es-CL')
const fmtDate = d => d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db

  // Buscar usuario miseal@gmail.com
  const owner = await db.collection('users').findOne({ email: 'miseal@gmail.com' })
  if (!owner) { console.log('❌ Usuario miseal@gmail.com no encontrado'); await mongoose.disconnect(); return }
  console.log(`\n✅ Cuenta: ${owner.name} <${owner.email}>  _id=${owner._id}`)

  // Buscar Diego Angulo en dependientes
  const diegoRegex = /diego\s*angulo/i
  let diegoId = null
  let diegoNombre = null

  if (owner.dependents?.length) {
    const dep = owner.dependents.find(d => diegoRegex.test(d.nombre))
    if (dep) {
      diegoId = dep._id
      diegoNombre = dep.nombre
      console.log(`\n👦 Dependiente encontrado: ${dep.nombre}  _id=${dep._id}  activo=${dep.activo}`)
    }
  }

  if (!diegoId) {
    // Buscar como usuario independiente
    const diegoUser = await db.collection('users').findOne({ $or: [{ name: diegoRegex }, { email: diegoRegex }] })
    if (diegoUser) {
      diegoId = diegoUser._id
      diegoNombre = diegoUser.name
      console.log(`\n👤 Usuario independiente: ${diegoUser.name} <${diegoUser.email}>  _id=${diegoUser._id}`)
    }
  }

  if (!diegoId) {
    console.log('\n❌ Diego Angulo no encontrado como dependiente ni usuario independiente.')
    await mongoose.disconnect(); return
  }

  // Buscar workshops de "iniciación musical en piano"
  const pianoRegex = /iniciaci[oó]n\s*musical|piano/i
  const workshops = await db.collection('workshops').find({ titulo: pianoRegex }).toArray()
  console.log(`\n🎹 Talleres encontrados (${workshops.length}):`)
  workshops.forEach(w => console.log(`   [${w._id}] "${w.titulo}"  estado=${w.estado}  modeloAcceso=${w.modeloAcceso}`))

  const workshopIds = workshops.map(w => w._id)

  // Subscriptions de Diego Angulo
  const subsQuery = {
    $or: [
      { studentId: owner._id, dependentId: diegoId },
      { studentId: diegoId }
    ],
    ...(workshopIds.length ? { workshopId: { $in: workshopIds } } : {})
  }
  // También buscar sin filtro de workshop si no hay coincidencias
  let subs = await db.collection('subscriptions').find(subsQuery).sort({ createdAt: -1 }).toArray()
  if (!subs.length && workshopIds.length === 0) {
    // Buscar todas las subs del apoderado donde dependentId = diegoId
    subs = await db.collection('subscriptions').find({
      $or: [
        { studentId: owner._id, dependentId: diegoId },
        { studentId: diegoId }
      ]
    }).sort({ createdAt: -1 }).toArray()
  }

  console.log(`\n📋 Subscriptions de Diego Angulo (${subs.length}):`)
  for (const s of subs) {
    const w = await db.collection('workshops').findOne({ _id: s.workshopId }, { projection: { titulo: 1 } })
    console.log(`\n  ┌─ [${s.estado}] "${w?.titulo ?? '???'}"`)
    console.log(`  │  _id=${s._id}`)
    console.log(`  │  Menor: ${s.dependentNombreSnapshot ?? '— (apoderado mismo)'}  dependentId=${s.dependentId ?? '—'}`)
    console.log(`  │  Sesiones: usadas=${s.sesionesUsadas}  totales=${s.sesionesTotales}  disponibles=${s.sesionesDisponibles}`)
    console.log(`  │  Monto: ${fmtCLP(s.monto)}  precioEspecial=${s.precioEspecial ?? false}`)
    console.log(`  │  Compra: ${fmtDate(s.fechaCompra)}  Vencimiento: ${fmtDate(s.fechaVencimiento)}`)
    console.log(`  │  pagoRef=${s.pagoRef ?? '—'}`)
    if (s.clasesPrepagadas?.cantidad) {
      const cp = s.clasesPrepagadas
      console.log(`  │  Prepagadas: ${cp.consumidas}/${cp.cantidad}  caduca=${fmtDate(cp.caducaEn)}  pagado=${fmtDate(cp.fechaPago)}`)
    }

    // Bookings de esta subscription
    const bookings = await db.collection('bookings').find({ subscriptionId: s._id }).sort({ fecha: 1 }).toArray()
    console.log(`  │  Bookings (${bookings.length}):`)
    for (const b of bookings) {
      const icon = b.estado === 'confirmada' ? '✅' : b.estado === 'cancelada' ? '❌' : b.estado === 'asistio' ? '🟢' : b.estado === 'no_asistio' ? '🔴' : '⏳'
      console.log(`  │    ${icon} [${b.estado}]  fecha=${fmtDate(b.fecha)}  slotIndex=${b.slotIndex ?? '—'}  _id=${b._id}`)
      if (b.reagendamiento) console.log(`  │       reagendado → ${fmtDate(b.reagendamiento.nuevaFecha)}  estado=${b.reagendamiento.estado}`)
    }
    console.log(`  └─`)
  }

  if (!subs.length) {
    console.log('  Sin subscriptions encontradas.')
    // Buscar enrollments también
    const enrolls = await db.collection('enrollments').find({
      $or: [
        { studentId: owner._id, dependentId: diegoId },
        { studentId: diegoId }
      ]
    }).sort({ createdAt: -1 }).toArray()
    console.log(`\n📋 Enrollments de Diego Angulo (${enrolls.length}):`)
    for (const e of enrolls) {
      const w = await db.collection('workshops').findOne({ _id: e.workshopId }, { projection: { titulo: 1 } })
      console.log(`  [${e.estado}] "${w?.titulo ?? '???'}"  monto=${fmtCLP(e.monto)}  slotIndex=${e.slotIndex}  pagoRef=${e.pagoRef ?? '—'}`)
    }
  }

  await mongoose.disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
