/**
 * Reconcilia Workshop.slots[i].reservas contando Bookings + Enrollments reales.
 * Si no hay coincidencia → pone reservas=0.
 */
import 'dotenv/config'
import mongoose from 'mongoose'

const isDryRun = process.argv.includes('--dry-run')

const WorkshopS = new mongoose.Schema({}, { strict: false })
const BookingS  = new mongoose.Schema({}, { strict: false })
const EnrollS   = new mongoose.Schema({}, { strict: false })

const Workshop = mongoose.models.Workshop || mongoose.model('Workshop', WorkshopS)
const Booking  = mongoose.models.Booking  || mongoose.model('Booking',  BookingS)
const Enroll   = mongoose.models.Enrollment || mongoose.model('Enrollment', EnrollS)

mongoose.connect(process.env.MONGODB_URI!).then(async () => {
  console.log(isDryRun ? '🔍 DRY-RUN — no se escribe nada\n' : '🔴 MODO REAL\n')

  const workshops = await Workshop.find({ activo: true }).lean<any[]>()
  let totalFixed = 0

  for (const w of workshops) {
    const wId = w._id
    const slots: any[] = w.slots ?? []

    // Contar bookings activos por slotIndex
    const bookings = await Booking.find({
      workshopId: wId,
      estado: { $nin: ['cancelada'] },
    }).lean<any[]>()

    // Contar enrollments activos por slotIndex
    const enrollments = await Enroll.find({
      workshopId: wId,
      estado: { $nin: ['cancelado'] },
      slotIndex: { $ne: null },
      activo: true,
    }).lean<any[]>()

    const counter = new Map<number, number>()
    for (const b of bookings)   counter.set(b.slotIndex, (counter.get(b.slotIndex) ?? 0) + 1)
    for (const e of enrollments) counter.set(e.slotIndex, (counter.get(e.slotIndex) ?? 0) + 1)

    const updates: Record<string, number> = {}
    for (let i = 0; i < slots.length; i++) {
      const real = counter.get(i) ?? 0
      if (slots[i].reservas !== real) {
        console.log(`  [${w.titulo}] slot ${i} (${slots[i].dia ?? slots[i].fecha ?? '?'} ${slots[i].horaInicio}): reservas ${slots[i].reservas} → ${real}`)
        updates[`slots.${i}.reservas`] = real
        totalFixed++
      }
    }

    if (!isDryRun && Object.keys(updates).length > 0) {
      await Workshop.updateOne({ _id: wId }, { $set: updates })
    }
  }

  console.log(`\n${isDryRun ? '[DRY-RUN]' : '✅'} Slots corregidos: ${totalFixed}`)
  process.exit(0)
})
