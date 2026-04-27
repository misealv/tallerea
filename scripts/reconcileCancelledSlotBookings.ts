/**
 * reconcileCancelledSlotBookings.ts
 *
 * Encuentra todos los Bookings con estado='reservada' cuyo slot en el Workshop
 * ya está marcado como cancelado=true. Los marca como cancelada/tallerista
 * y devuelve la sesión a la suscripción correspondiente.
 *
 * Uso:
 *   npx tsx scripts/reconcileCancelledSlotBookings.ts --dry-run   # solo muestra
 *   npx tsx scripts/reconcileCancelledSlotBookings.ts             # ejecuta
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const MONGODB_URI = process.env.MONGODB_URI!
if (!MONGODB_URI) { console.error('Falta MONGODB_URI'); process.exit(1) }

const dryRun = process.argv.includes('--dry-run')

// ── Schemas mínimos ────────────────────────────────────────────────────────

const BookingSchema = new mongoose.Schema({
  workshopId:    { type: mongoose.Schema.Types.ObjectId },
  subscriptionId:{ type: mongoose.Schema.Types.ObjectId },
  studentId:     { type: mongoose.Schema.Types.ObjectId },
  slotIndex:     { type: Number },
  fecha:         { type: Date },
  estado:        { type: String },
  canceladaEn:   { type: Date },
  canceladaRazon:{ type: String },
  activo:        { type: Boolean },
}, { timestamps: true })

const WorkshopSchema = new mongoose.Schema({
  titulo: { type: String },
  slots:  [{ horaInicio: String, horaFin: String, cancelado: Boolean, reservas: Number }],
  activo: { type: Boolean },
})

const SubscriptionSchema = new mongoose.Schema({
  sesionesDisponibles: { type: Number },
  sesionesUsadas:      { type: Number },
})

const Booking      = mongoose.models.Booking      || mongoose.model('Booking',      BookingSchema)
const Workshop     = mongoose.models.Workshop     || mongoose.model('Workshop',     WorkshopSchema)
const Subscription = mongoose.models.Subscription || mongoose.model('Subscription', SubscriptionSchema)

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  await mongoose.connect(MONGODB_URI)
  console.log(`\n[reconcile] Conectado a MongoDB${dryRun ? ' (DRY RUN)' : ''}\n`)

  // Traer todos los bookings activos con estado reservada
  const bookings = await Booking.find({ estado: 'reservada', activo: true })
    .select('_id workshopId subscriptionId slotIndex fecha studentId')
    .lean<{ _id: mongoose.Types.ObjectId; workshopId: mongoose.Types.ObjectId; subscriptionId: mongoose.Types.ObjectId; slotIndex: number; fecha: Date; studentId: mongoose.Types.ObjectId }[]>()

  console.log(`[reconcile] Bookings reservadas totales: ${bookings.length}`)

  // Agrupar por workshopId para reducir queries
  const byWorkshop = new Map<string, typeof bookings>()
  for (const b of bookings) {
    const k = String(b.workshopId)
    const arr = byWorkshop.get(k) ?? []
    arr.push(b)
    byWorkshop.set(k, arr)
  }

  let totalFixed = 0

  for (const workshopId of Array.from(byWorkshop.keys())) {
    const wBookings = byWorkshop.get(workshopId)!
    const workshop = await Workshop.findById(workshopId).select('titulo slots').lean<{
      titulo: string
      slots: Array<{ cancelado?: boolean; horaInicio: string; horaFin: string }>
    }>()
    if (!workshop) continue

    for (const b of wBookings) {
      const slot = workshop.slots?.[b.slotIndex]
      if (!slot?.cancelado) continue

      // Este booking tiene el slot cancelado pero sigue como 'reservada'
      console.log(`  → Booking ${b._id}`)
      console.log(`    Taller : ${workshop.titulo}`)
      console.log(`    Slot   : ${b.slotIndex} (${slot.horaInicio}–${slot.horaFin})`)
      console.log(`    Fecha  : ${b.fecha?.toISOString().slice(0, 10)}`)
      console.log(`    Sub    : ${b.subscriptionId}`)

      if (!dryRun) {
        await Booking.updateOne(
          { _id: b._id },
          { estado: 'cancelada', canceladaEn: new Date(), canceladaRazon: 'tallerista' }
        )
        if (b.subscriptionId) {
          await Subscription.updateOne(
            { _id: b.subscriptionId },
            { $inc: { sesionesDisponibles: 1, sesionesUsadas: -1 } }
          )
          console.log(`    ✓ Booking cancelado + sesión devuelta a subscription`)
        } else {
          console.log(`    ✓ Booking cancelado (sin subscription asociada)`)
        }
      } else {
        console.log(`    [DRY RUN] Se cancelaría y devolvería sesión`)
      }
      totalFixed++
    }
  }

  console.log(`\n[reconcile] ${dryRun ? 'Encontrados' : 'Corregidos'}: ${totalFixed} bookings`)
  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
