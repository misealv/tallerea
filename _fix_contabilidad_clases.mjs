// Reparación: alinear contadores tras refactor "fuente única sesionesDisponibles".
// - Pone clasesPrepagadas.consumidas = 0 en todas las subs activas (metadata histórica).
// - Verifica sesionesUsadas vs bookings reales (asistio | reservada | no_asistio) y reporta drift.
// - Si --apply, corrige sesionesUsadas/sesionesDisponibles según bookings reales.
// Uso: node _fix_contabilidad_clases.mjs            (dry-run)
//      node _fix_contabilidad_clases.mjs --apply   (escribe)

import { config } from 'dotenv'
import mongoose from 'mongoose'

config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')

const SubSchema = new mongoose.Schema({}, { strict: false, collection: 'subscriptions' })
const BookSchema = new mongoose.Schema({}, { strict: false, collection: 'bookings' })
const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'users' })

const Subscription = mongoose.model('Subscription', SubSchema)
const Booking = mongoose.model('Booking', BookSchema)
const User = mongoose.model('User', UserSchema)

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  console.log(`\n=== Reparación contabilidad de clases ${APPLY ? '[APPLY]' : '[DRY-RUN]'} ===\n`)

  const subs = await Subscription.find({ estado: 'activa', activo: { $ne: false } }).lean()
  console.log(`Suscripciones activas: ${subs.length}\n`)

  let driftCount = 0
  let prepaidResetCount = 0

  for (const sub of subs) {
    const studentName = sub.dependentNombreSnapshot
      ?? (await User.findById(sub.studentId).select('name').lean())?.name
      ?? sub.studentId

    // Contar bookings que consumieron sesión (cualquier estado excepto cancelada)
    const bookingsCount = await Booking.countDocuments({
      subscriptionId: sub._id,
      estado: { $ne: 'cancelada' },
    })

    const sesUsadas = sub.sesionesUsadas ?? 0
    const sesDisp = sub.sesionesDisponibles ?? 0
    const sesTot = sub.sesionesTotales ?? 0
    const prepConsumidas = sub.clasesPrepagadas?.consumidas ?? null

    const driftUsadas = sesUsadas !== bookingsCount
    const sumaOk = sesUsadas + sesDisp === sesTot

    const flags = []
    if (driftUsadas) flags.push(`USADAS:${sesUsadas}≠bookings:${bookingsCount}`)
    if (!sumaOk) flags.push(`SUMA:${sesUsadas}+${sesDisp}≠${sesTot}`)
    if (prepConsumidas !== null && prepConsumidas !== 0) flags.push(`PREP:${prepConsumidas}→0`)

    if (flags.length === 0) continue

    driftCount++
    console.log(`• ${studentName} (sub ${sub._id})`)
    console.log(`    bookings reales: ${bookingsCount}`)
    console.log(`    sesionesUsadas: ${sesUsadas} | sesionesDisponibles: ${sesDisp} | sesionesTotales: ${sesTot}`)
    if (prepConsumidas !== null) console.log(`    clasesPrepagadas.consumidas: ${prepConsumidas}`)
    console.log(`    flags: ${flags.join(' | ')}`)

    if (APPLY) {
      // Opción A: SOLO reset cosmético de clasesPrepagadas.consumidas.
      // Drift en sesionesUsadas / suma se revisa manualmente (no se autocorrige).
      if (prepConsumidas !== null && prepConsumidas !== 0) {
        await Subscription.updateOne(
          { _id: sub._id },
          { $set: { 'clasesPrepagadas.consumidas': 0 } }
        )
        prepaidResetCount++
        console.log(`    → reset clasesPrepagadas.consumidas=0`)
      }
      if (driftUsadas || !sumaOk) {
        console.log(`    ⚠ REVISAR MANUALMENTE (no autocorregido)`)
      }
    }
    console.log()
  }

  console.log(`\n=== Resumen ===`)
  console.log(`Subs con drift: ${driftCount}/${subs.length}`)
  console.log(`clasesPrepagadas.consumidas reseteado: ${prepaidResetCount}`)
  console.log(APPLY ? '✓ Cambios aplicados' : '⚠ Dry-run. Re-ejecutar con --apply para escribir.')

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
