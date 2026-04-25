/**
 * scripts/deduplicateSlots.ts
 * Elimina slots duplicados en workshop.slots[] de la DB.
 * Criterio: mismo (fecha + horaInicio + horaFin) → conservar el primero, eliminar el resto.
 *
 * Uso: npx tsx scripts/deduplicateSlots.ts
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) { console.error('MONGODB_URI no definida'); process.exit(1) }

const SlotSchema = new mongoose.Schema({
  dia: String,
  horaInicio: String,
  horaFin: String,
  fecha: Date,
  reservas: { type: Number, default: 0 },
  cancelado: { type: Boolean, default: false },
  cupoMax: Number,
  cupoDisponible: Number,
}, { _id: false })

const WorkshopSchema = new mongoose.Schema({
  titulo: String,
  slots: [SlotSchema],
}, { strict: false, collection: 'workshops' })

const Workshop = mongoose.model('WorkshopDedup', WorkshopSchema)

async function run() {
  await mongoose.connect(MONGODB_URI as string)
  console.log('Conectado a MongoDB\n')

  const workshops = await Workshop.find({ 'slots.0': { $exists: true } }).lean<{
    _id: mongoose.Types.ObjectId
    titulo?: string
    slots: Array<{ fecha?: Date; horaInicio?: string; horaFin?: string; reservas?: number }>
  }[]>()

  let totalFixed = 0

  for (const w of workshops) {
    const seen = new Map<string, number>()
    const toKeep: number[] = []
    const duplicates: number[] = []

    for (let i = 0; i < w.slots.length; i++) {
      const s = w.slots[i]
      // Clave por fecha concreta O por día de semana (talleres recurrentes sin fecha fija)
      const key = s.fecha
        ? `fecha:${s.fecha.toISOString()}-${s.horaInicio}-${s.horaFin}`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : `dia:${(s as any).dia}-${s.horaInicio}-${s.horaFin}`

      if (!seen.has(key)) {
        seen.set(key, i)
        toKeep.push(i)
      } else {
        duplicates.push(i)
      }
    }

    if (duplicates.length === 0) continue

    console.log(`Taller: "${w.titulo}" (${w._id})`)
    console.log(`  Slots antes:  ${w.slots.length}`)
    console.log(`  Duplicados:   ${duplicates.length}`)

    const cleanSlots = toKeep.map(i => w.slots[i])
    await Workshop.updateOne({ _id: w._id }, { $set: { slots: cleanSlots } })

    console.log(`  Slots después: ${cleanSlots.length}  ✓\n`)
    totalFixed++
  }

  if (totalFixed === 0) {
    console.log('No se encontraron duplicados.')
  } else {
    console.log(`\nResumen: ${totalFixed} taller(es) limpiado(s).`)
  }

  await mongoose.disconnect()
}

run().catch(e => { console.error(e); process.exit(1) })
