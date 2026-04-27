/**
 * Migración Fase 1: prepara la base de datos para inscripción manual.
 *
 * Acciones:
 *   1. Setea origenInscripcion='checkout' en Enrollments y Subscriptions sin el campo.
 *   2. Setea precioEspecial=false en Subscriptions sin el campo.
 *   3. Reconstruye los índices únicos para incluir dependentId (apoderados con varios hijos).
 *
 * Uso:
 *   npx tsx scripts/addOrigenInscripcionDefault.ts --dry-run
 *   npx tsx scripts/addOrigenInscripcionDefault.ts
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })  // fallback si MONGODB_URI vive en .env

const isDryRun = process.argv.includes('--dry-run')

// Índices antiguos a remover (no incluyen dependentId)
const OLD_INDEXES: Array<{ collection: string; name: string }> = [
  { collection: 'subscriptions', name: 'workshopId_1_studentId_1' },
  { collection: 'enrollments', name: 'workshopId_1_studentId_1_slotIndex_1' },
  { collection: 'enrollments', name: 'workshopId_1_studentId_1_esClasePrueba_1' },
  { collection: 'bookings', name: 'workshopId_1_studentId_1_slotIndex_1' },
]

async function dropOldIndexIfExists(db: any, collection: string, name: string) {
  const existing = await db.collection(collection).indexes()
  if (existing.find((i: any) => i.name === name)) {
    if (isDryRun) {
      console.log(`[DRY-RUN] Drop \u00edndice ${collection}.${name}`)
    } else {
      await db.collection(collection).dropIndex(name)
      console.log(`✓ Drop \u00edndice ${collection}.${name}`)
    }
  }
}

async function run() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI no está definida en .env / .env.local')

  await mongoose.connect(uri)
  console.log('Conectado a MongoDB.')

  const db = mongoose.connection.db!

  // -- 1. origenInscripcion default
  const pendingEnrollments = await db
    .collection('enrollments')
    .countDocuments({ origenInscripcion: { $exists: false } })
  const pendingSubscriptions = await db
    .collection('subscriptions')
    .countDocuments({ origenInscripcion: { $exists: false } })

  // -- 2. precioEspecial default
  const pendingPrecioEspecial = await db
    .collection('subscriptions')
    .countDocuments({ precioEspecial: { $exists: false } })

  console.log(`[INFO] Enrollments sin origenInscripcion:   ${pendingEnrollments}`)
  console.log(`[INFO] Subscriptions sin origenInscripcion: ${pendingSubscriptions}`)
  console.log(`[INFO] Subscriptions sin precioEspecial:    ${pendingPrecioEspecial}`)

  if (isDryRun) {
    for (const { collection, name } of OLD_INDEXES) {
      await dropOldIndexIfExists(db, collection, name)
    }
    console.log('[DRY-RUN] Sin cambios aplicados.')
    await mongoose.disconnect()
    return
  }

  const enrollmentResult = await db
    .collection('enrollments')
    .updateMany(
      { origenInscripcion: { $exists: false } },
      { $set: { origenInscripcion: 'checkout' } }
    )

  const subscriptionResult = await db
    .collection('subscriptions')
    .updateMany(
      { origenInscripcion: { $exists: false } },
      { $set: { origenInscripcion: 'checkout' } }
    )

  const precioEspecialResult = await db
    .collection('subscriptions')
    .updateMany(
      { precioEspecial: { $exists: false } },
      { $set: { precioEspecial: false } }
    )

  console.log(`✅ Enrollments migrados (origen):    ${enrollmentResult.modifiedCount}`)
  console.log(`✅ Subscriptions migradas (origen):  ${subscriptionResult.modifiedCount}`)
  console.log(`✅ Subscriptions migradas (precio):  ${precioEspecialResult.modifiedCount}`)

  // -- 3. Recrear índices únicos
  for (const { collection, name } of OLD_INDEXES) {
    await dropOldIndexIfExists(db, collection, name)
  }

  // Forzar sincronización de los nuevos índices definidos en los schemas
  await import('../src/models/Subscription')
  await import('../src/models/Enrollment')
  await import('../src/models/Booking')

  const Subscription = mongoose.models.Subscription
  const Enrollment = mongoose.models.Enrollment
  const Booking = mongoose.models.Booking

  await Subscription.syncIndexes()
  await Enrollment.syncIndexes()
  await Booking.syncIndexes()
  console.log('✓ Índices sincronizados con los schemas actuales.')

  await mongoose.disconnect()
  console.log('Listo.')
}

run().catch((err) => {
  console.error('Error en migración:', err)
  process.exit(1)
})
