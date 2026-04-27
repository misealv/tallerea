import mongoose from 'mongoose'
import 'dotenv/config'

await mongoose.connect(process.env.MONGODB_URI)
const Workshop = mongoose.connection.db.collection('workshops')
const workshops = await Workshop.find({ activo: true }).toArray()
for (const w of workshops) {
  const total = (w.slots || []).length
  const conFecha = (w.slots || []).filter(s => s.fecha).length
  const plantilla = (w.plantillaSemanal || []).length
  console.log(`${w.titulo}: slots=${total}, conFecha=${conFecha}, plantilla=${plantilla}, modeloAcceso=${w.modeloAcceso}`)
}
await mongoose.disconnect()
