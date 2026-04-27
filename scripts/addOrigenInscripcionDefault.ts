/**
 * Migración Fase 1: setear origenInscripcion='checkout' en todos los registros
 * existentes de Enrollment y Subscription que no tengan el campo.
 *
 * Uso:
 *   npx tsx scripts/addOrigenInscripcionDefault.ts
 *   npx tsx scripts/addOrigenInscripcionDefault.ts --dry-run
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const isDryRun = process.argv.includes('--dry-run')

async function run() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI no está definida en .env.local')

  await mongoose.connect(uri)
  console.log('Conectado a MongoDB.')

  const db = mongoose.connection.db!

  if (isDryRun) {
    const pendingEnrollments = await db
      .collection('enrollments')
      .countDocuments({ origenInscripcion: { $exists: false } })

    const pendingSubscriptions = await db
      .collection('subscriptions')
      .countDocuments({ origenInscripcion: { $exists: false } })

    console.log(`[DRY-RUN] Enrollments a migrar:    ${pendingEnrollments}`)
    console.log(`[DRY-RUN] Subscriptions a migrar:  ${pendingSubscriptions}`)
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

  console.log(`✅ Enrollments migrados:   ${enrollmentResult.modifiedCount}`)
  console.log(`✅ Subscriptions migradas: ${subscriptionResult.modifiedCount}`)

  await mongoose.disconnect()
  console.log('Listo.')
}

run().catch((err) => {
  console.error('Error en migración:', err)
  process.exit(1)
})
