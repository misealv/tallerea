import mongoose from 'mongoose'
import 'dotenv/config'
await mongoose.connect(process.env.MONGODB_URI)
const db = mongoose.connection.db.collection('workshops')
const w = await db.findOne({ slug: 'programa-de-iniciacion-musical-al-piano' })
console.log(JSON.stringify({
  titulo: w.titulo,
  precio: w.precio,
  precioModalidad: w.precioModalidad,
  modalidadPrecio: w.modalidadPrecio,
  precioFijo: w.precioFijo,
  paquetes: w.paquetes,
  modeloAcceso: w.modeloAcceso,
}, null, 2))
await mongoose.disconnect()
