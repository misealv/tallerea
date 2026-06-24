import mongoose from 'mongoose'
import 'dotenv/config'

await mongoose.connect(process.env.MONGODB_URI)
const db = mongoose.connection.db

const w = await db.collection('workshops').findOne({ slug: 'programa-de-iniciacion-musical-al-piano' })
console.log('=== WORKSHOP ===')
console.log('titulo:', w?.titulo)
console.log('_id:', String(w?._id))
console.log('modeloAcceso:', w?.modeloAcceso)
console.log('cupoPorSesion:', w?.cupoPorSesion)
console.log('clasePrueba:', JSON.stringify(w?.clasePrueba))
console.log('slots:')
;(w?.slots ?? []).forEach((s, i) => {
  console.log(`  [${i}] dia=${s.dia} ${s.horaInicio}-${s.horaFin} fecha=${s.fecha ? new Date(s.fecha).toISOString() : 'null'} reservas=${s.reservas} cupoDisponible=${s.cupoDisponible} cancelado=${s.cancelado}`)
})

console.log('\n=== ENROLLMENTS (prueba) de este taller ===')
const enrolls = await db.collection('enrollments').find({ workshopId: w?._id, esClasePrueba: true }).toArray()
for (const e of enrolls) {
  console.log(JSON.stringify({
    _id: String(e._id),
    studentId: String(e.studentId),
    slotIndex: e.slotIndex,
    slotFecha: e.slotFecha ? new Date(e.slotFecha).toISOString() : null,
    estado: e.estado,
    esClasePrueba: e.esClasePrueba,
    activo: e.activo,
    monto: e.monto,
    dependentNombreSnapshot: e.dependentNombreSnapshot,
    createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : null,
  }, null, 2))
  // nombre del student
  const u = await db.collection('users').findOne({ _id: e.studentId })
  console.log('   student:', u?.name, u?.email)
}

console.log('\n=== Posibles enrollments por nombre Tahia ===')
const usersTahia = await db.collection('users').find({ name: /tahia/i }).toArray()
for (const u of usersTahia) {
  console.log('user:', String(u._id), u.name, u.email)
}

await mongoose.disconnect()
