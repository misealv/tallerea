/**
 * Auditoría de salud de slots: clasifica talleres recurrentes según el tipo de slots
 * para validar que el fix del picker (modo expandido vs plantilla) cubre todos los casos.
 */
import mongoose from 'mongoose'
import 'dotenv/config'

await mongoose.connect(process.env.MONGODB_URI)
const db = mongoose.connection.db

const workshops = await db.collection('workshops').find({
  modeloAcceso: 'recurrente',
  activo: true,
}).toArray()

console.log(`Talleres recurrentes activos: ${workshops.length}\n`)

let expandidoPuro = 0, plantillaPuro = 0, mixto = 0, sinSlots = 0

for (const w of workshops) {
  const slots = w.slots ?? []
  if (slots.length === 0) { sinSlots++; continue }
  const conFecha = slots.filter(s => s.fecha).length
  const sinFecha = slots.length - conFecha

  let tipo
  if (conFecha === slots.length) { tipo = 'EXPANDIDO_PURO'; expandidoPuro++ }
  else if (conFecha === 0)        { tipo = 'PLANTILLA_PURO'; plantillaPuro++ }
  else                            { tipo = 'MIXTO ⚠️'; mixto++ }

  console.log(`[${tipo}] "${w.titulo}" — total=${slots.length} conFecha=${conFecha} sinFecha=${sinFecha}`)
}

console.log(`\n=== RESUMEN ===`)
console.log(`Expandido puro: ${expandidoPuro}`)
console.log(`Plantilla puro: ${plantillaPuro}`)
console.log(`Mixto (riesgo): ${mixto}`)
console.log(`Sin slots: ${sinSlots}`)

await mongoose.disconnect()
