import mongoose from 'mongoose'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const uri = process.env.MONGODB_URI
await mongoose.connect(uri)
const db = mongoose.connection.db
const ws = await db.collection('workshops').find({ activo: true }).project({ titulo:1, ownerId:1, tipoRecurrencia:1, modeloAcceso:1, fechaInicio:1, plantillaSemanal:1, slots:1, recurrencia:1 }).toArray()
const now = new Date()
for (const w of ws) {
  const total = (w.slots ?? []).length
  const conFecha = (w.slots ?? []).filter(s => s.fecha).length
  const futuras = (w.slots ?? []).filter(s => s.fecha && new Date(s.fecha) > now).length
  console.log(`${w.titulo}  | recurrencia=${w.tipoRecurrencia} acceso=${w.modeloAcceso} plantilla=${(w.plantillaSemanal??[]).length} slots=${total} conFecha=${conFecha} futuras=${futuras}`)
  if (total > 0) {
    console.log('  primer slot:', JSON.stringify(w.slots[0]))
    console.log('  ultimo slot:', JSON.stringify(w.slots[total-1]))
  }
  console.log('  recurrencia config:', JSON.stringify(w.recurrencia ?? null), 'fechaInicio:', w.fechaInicio)
}
process.exit(0)
