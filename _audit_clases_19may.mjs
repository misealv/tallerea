// Auditoría de contabilidad de clases — Juan Pablo Ramaciotti + Lidia Vargas
// Compara: sesionesDisponibles/Usadas en Subscription vs Bookings reales en DB
import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local' })
import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) { console.error('Falta MONGODB_URI'); process.exit(1) }

await mongoose.connect(MONGODB_URI)
const db = mongoose.connection.db

const Users = db.collection('users')
const Subs = db.collection('subscriptions')
const Bookings = db.collection('bookings')
const Workshops = db.collection('workshops')

async function findUser(query) {
  const re = new RegExp(query, 'i')
  return Users.find({ $or: [{ name: re }, { email: re }] }).toArray()
}

async function auditStudent(student) {
  console.log('\n' + '═'.repeat(80))
  console.log(`👤 ${student.name} (${student.email})  _id=${student._id}`)
  console.log('═'.repeat(80))

  const subs = await Subs.find({ studentId: student._id }).sort({ createdAt: 1 }).toArray()
  if (subs.length === 0) {
    console.log('  (sin suscripciones)')
    return
  }

  for (const s of subs) {
    const ws = await Workshops.findOne({ _id: s.workshopId }, { projection: { titulo: 1 } })
    console.log(`\n  📋 Subscription _id=${s._id}`)
    console.log(`     Workshop: ${ws?.titulo ?? '???'}`)
    console.log(`     estado:           ${s.estado}`)
    console.log(`     origen:           ${s.origenInscripcion}`)
    console.log(`     fechaCompra:      ${s.fechaCompra?.toISOString().slice(0, 10)}`)
    console.log(`     fechaVencimiento: ${s.fechaVencimiento?.toISOString().slice(0, 10)}`)
    console.log(`     sesionesTotales:      ${s.sesionesTotales}`)
    console.log(`     sesionesUsadas:       ${s.sesionesUsadas}`)
    console.log(`     sesionesDisponibles:  ${s.sesionesDisponibles}`)
    if (s.clasesPrepagadas?.cantidad) {
      console.log(`     clasesPrepagadas:`)
      console.log(`       cantidad:    ${s.clasesPrepagadas.cantidad}`)
      console.log(`       consumidas:  ${s.clasesPrepagadas.consumidas}`)
      console.log(`       caducaEn:    ${s.clasesPrepagadas.caducaEn?.toISOString().slice(0,10) ?? '—'}`)
    }

    const bks = await Bookings.find({ subscriptionId: s._id }).sort({ fecha: 1 }).toArray()
    console.log(`\n     📚 Bookings asociados (${bks.length}):`)
    const counts = { reservada: 0, asistio: 0, no_asistio: 0, cancelada: 0 }
    for (const b of bks) {
      counts[b.estado] = (counts[b.estado] ?? 0) + 1
      console.log(`       - ${b.fecha?.toISOString().slice(0,10)} | ${b.estado.padEnd(11)} | razon=${b.canceladaRazon ?? '—'} | activo=${b.activo} | _id=${b._id}`)
    }
    console.log(`\n     📊 Resumen bookings: ` +
      `reservadas=${counts.reservada}  asistió=${counts.asistio}  no_asistió=${counts.no_asistio}  canceladas=${counts.cancelada}`)

    // Cálculo esperado
    const consumeReal = counts.reservada + counts.asistio + counts.no_asistio
    const disponibleEsperado = s.sesionesTotales - consumeReal
    console.log(`\n     🧮 Cálculo esperado:`)
    console.log(`        consumidas = reservadas+asistió+no_asistió = ${consumeReal}`)
    console.log(`        disponibles esperadas = ${s.sesionesTotales} − ${consumeReal} = ${disponibleEsperado}`)

    const disponibleSistema = s.sesionesDisponibles
    const diff = disponibleSistema - disponibleEsperado
    const flag = diff === 0 ? '✅' : '⚠️ '
    console.log(`        disponibles en sistema: ${disponibleSistema}`)
    console.log(`        ${flag} diferencia: ${diff > 0 ? '+' : ''}${diff} ${diff !== 0 ? '← INCONSISTENCIA' : ''}`)
  }
}

const ramaciotti = (await findUser('ramaciotti')).filter(u => /juan/i.test(u.name ?? ''))
const lidia = await findUser('lidia.*vargas|vargas.*lidia')

console.log(`\nUsuarios encontrados Ramaciotti: ${ramaciotti.length}`)
for (const u of ramaciotti) await auditStudent(u)

console.log(`\nUsuarios encontrados Lidia Vargas: ${lidia.length}`)
for (const u of lidia) await auditStudent(u)

await mongoose.disconnect()
