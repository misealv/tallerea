/**
 * Corrige el slotIndex del enrollment de prueba de Tahia Droguett.
 *
 * El picker asignó slotIndex=2 (viernes 19:00, 24-abr) a la reserva del
 * viernes 3-jul. El índice correcto en el array de slots es 165.
 *
 * Operaciones (en transacción):
 *   1. Enrollment._id = 6a3b19fec40edf52e496aff9 → slotIndex: 2 → 165
 *   2. Workshop.slots[2].reservas  -= 1  (era 1, quedará en 0)
 *   3. Workshop.slots[165].reservas += 1  (era 0, quedará en 1)
 */
import mongoose from 'mongoose'
import 'dotenv/config'

await mongoose.connect(process.env.MONGODB_URI)
const db = mongoose.connection.db

const WORKSHOP_ID  = new mongoose.Types.ObjectId('69ebee808d91b3d64fccc6b1')
const ENROLLMENT_ID = new mongoose.Types.ObjectId('6a3b19fec40edf52e496aff9')
const OLD_IDX = 2
const NEW_IDX = 165

// ── Pre-checks ──────────────────────────────────────────────────────────────
const enrollment = await db.collection('enrollments').findOne({ _id: ENROLLMENT_ID })
if (!enrollment) {
  console.error('❌ Enrollment no encontrado')
  await mongoose.disconnect(); process.exit(1)
}

console.log('Enrollment actual:', {
  _id:        String(enrollment._id),
  studentId:  String(enrollment.studentId),
  slotIndex:  enrollment.slotIndex,
  slotFecha:  enrollment.slotFecha ? new Date(enrollment.slotFecha).toISOString() : null,
  estado:     enrollment.estado,
  esClasePrueba: enrollment.esClasePrueba,
})

if (enrollment.slotIndex === NEW_IDX) {
  console.log('✅ Ya corregido anteriormente (slotIndex === 165). Sin cambios.')
  await mongoose.disconnect(); process.exit(0)
}

if (enrollment.slotIndex !== OLD_IDX) {
  console.error(`❌ slotIndex inesperado: ${enrollment.slotIndex}. Revisar manualmente.`)
  await mongoose.disconnect(); process.exit(1)
}

const workshop = await db.collection('workshops').findOne({ _id: WORKSHOP_ID })
if (!workshop) {
  console.error('❌ Workshop no encontrado')
  await mongoose.disconnect(); process.exit(1)
}

const slotOld = workshop.slots[OLD_IDX]
const slotNew = workshop.slots[NEW_IDX]
console.log(`\nslot[${OLD_IDX}]: ${slotOld.dia} ${slotOld.horaInicio} fecha=${new Date(slotOld.fecha).toISOString().slice(0,10)} reservas=${slotOld.reservas}`)
console.log(`slot[${NEW_IDX}]: ${slotNew.dia} ${slotNew.horaInicio} fecha=${new Date(slotNew.fecha).toISOString().slice(0,10)} reservas=${slotNew.reservas}`)

if (slotNew.reservas >= workshop.cupoPorSesion) {
  console.error(`❌ slot[${NEW_IDX}] ya está lleno (${slotNew.reservas}/${workshop.cupoPorSesion}). Abortar.`)
  await mongoose.disconnect(); process.exit(1)
}

// ── Transacción ─────────────────────────────────────────────────────────────
const session = await mongoose.startSession()
session.startTransaction()
try {
  // 1. Corregir slotIndex en el enrollment
  await db.collection('enrollments').updateOne(
    { _id: ENROLLMENT_ID },
    { $set: { slotIndex: NEW_IDX } },
    { session }
  )

  // 2. Decrementar reservas del slot antiguo (con floor en 0)
  const nuevasReservasOld = Math.max(0, (slotOld.reservas ?? 0) - 1)
  await db.collection('workshops').updateOne(
    { _id: WORKSHOP_ID },
    { $set: { [`slots.${OLD_IDX}.reservas`]: nuevasReservasOld } },
    { session }
  )

  // 3. Incrementar reservas del slot correcto
  await db.collection('workshops').updateOne(
    { _id: WORKSHOP_ID },
    { $inc: { [`slots.${NEW_IDX}.reservas`]: 1 } },
    { session }
  )

  await session.commitTransaction()
  console.log('\n✅ Transacción completada')
} catch (err) {
  await session.abortTransaction()
  console.error('❌ Error, rollback:', err)
  throw err
} finally {
  await session.endSession()
}

// ── Verificación ─────────────────────────────────────────────────────────────
const updEnrollment = await db.collection('enrollments').findOne({ _id: ENROLLMENT_ID })
const updWorkshop   = await db.collection('workshops').findOne({ _id: WORKSHOP_ID })

console.log('\n=== VERIFICACIÓN FINAL ===')
console.log('enrollment.slotIndex:', updEnrollment.slotIndex, updEnrollment.slotIndex === NEW_IDX ? '✅' : '❌')
console.log(`slot[${OLD_IDX}].reservas:`, updWorkshop.slots[OLD_IDX].reservas,  updWorkshop.slots[OLD_IDX].reservas === 0   ? '✅' : '⚠️')
console.log(`slot[${NEW_IDX}].reservas:`, updWorkshop.slots[NEW_IDX].reservas, updWorkshop.slots[NEW_IDX].reservas === 1   ? '✅' : '⚠️')

await mongoose.disconnect()
