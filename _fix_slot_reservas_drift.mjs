/**
 * Script: reconciliar slot.reservas vs conteo real de Bookings activos
 * Causa: bug en PATCH /api/tallerista/calendar/students que no decrementaba
 *        slot.reservas en talleres recurrentes (usaba cupoDisponible en cambio).
 *
 * Uso: node _fix_slot_reservas_drift.mjs [--dry-run]
 *
 * Con --dry-run solo reporta sin modificar nada.
 */
import 'dotenv/config'
import mongoose from 'mongoose'

const DRY_RUN = process.argv.includes('--dry-run')

const uri = process.env.MONGODB_URI
if (!uri) throw new Error('MONGODB_URI no definida en .env')

await mongoose.connect(uri)
const db = mongoose.connection.db
console.log(`Conectado. Modo: ${DRY_RUN ? 'DRY-RUN (sin cambios)' : 'LIVE (modificará datos)'}`)

// Traer todos los talleres recurrentes activos
const workshops = await db.collection('workshops').find({
  modeloAcceso: 'recurrente',
  activo: true,
}).toArray()

console.log(`\nTalleres recurrentes activos: ${workshops.length}`)

let totalFixed = 0
let totalSlots = 0

for (const ws of workshops) {
  if (!ws.slots?.length) continue
  const updates = []

  for (let i = 0; i < ws.slots.length; i++) {
    const slot = ws.slots[i]
    const cachedReservas = slot.reservas ?? 0

    // Contar bookings reales activos para este slot
    const actualCount = await db.collection('bookings').countDocuments({
      workshopId: ws._id,
      slotIndex: i,
      estado: { $ne: 'cancelada' },
      activo: true,
    })

    if (cachedReservas !== actualCount) {
      updates.push({ slotIndex: i, cached: cachedReservas, actual: actualCount })
    }
  }

  if (updates.length > 0) {
    console.log(`\n[${ws.titulo}] ${updates.length} slot(s) con drift:`)
    for (const u of updates) {
      console.log(`  slot[${u.slotIndex}]: slot.reservas=${u.cached} → real=${u.actual} (diff: ${u.cached - u.actual})`)
    }

    if (!DRY_RUN) {
      // Aplicar corrección slot por slot con $set
      for (const u of updates) {
        await db.collection('workshops').updateOne(
          { _id: ws._id },
          { $set: { [`slots.${u.slotIndex}.reservas`]: u.actual } }
        )
      }
      console.log(`  ✅ Corregido`)
      totalFixed += updates.length
    } else {
      console.log(`  [DRY-RUN] No se modificó`)
    }
    totalSlots += updates.length
  }
}

console.log(`\n─────────────────────────────────`)
console.log(`Slots con drift encontrados: ${totalSlots}`)
if (!DRY_RUN) console.log(`Slots corregidos:            ${totalFixed}`)
console.log(`─────────────────────────────────`)

await mongoose.disconnect()
console.log('Listo.')
