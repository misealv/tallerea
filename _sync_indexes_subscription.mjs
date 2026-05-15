// Sincroniza índices de Subscription en MongoDB Atlas.
// Crea el nuevo índice unique parcial para estado='pendiente_pago' que previene
// doble click → 2 subs. Antes valida que no haya duplicados existentes.
//
// Uso:
//   node _sync_indexes_subscription.mjs           # dry-run (solo reporta)
//   node _sync_indexes_subscription.mjs --apply   # ejecuta sync

import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local' })
import mongoose from 'mongoose'

const APPLY = process.argv.includes('--apply')

const SubSchema = new mongoose.Schema({}, { strict: false, collection: 'subscriptions' })
const Subscription = mongoose.model('Subscription', SubSchema)

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI no definida')
  await mongoose.connect(uri)
  console.log('Conectado a Atlas\n')

  // 1. Detectar duplicados pendiente_pago por (workshopId, studentId, dependentId)
  console.log('→ Buscando duplicados pendiente_pago...')
  const duplicados = await Subscription.aggregate([
    { $match: { estado: 'pendiente_pago', activo: true } },
    {
      $group: {
        _id: {
          workshopId: '$workshopId',
          studentId: '$studentId',
          dependentId: '$dependentId',
        },
        count: { $sum: 1 },
        ids: { $push: '$_id' },
        createdAt: { $push: '$createdAt' },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ])

  if (duplicados.length > 0) {
    console.log(`\n⚠️  ${duplicados.length} grupo(s) con duplicados:`)
    for (const d of duplicados) {
      console.log('  ', JSON.stringify(d._id), `→ ${d.count} subs:`, d.ids.map(String))
    }
    console.log('\n🚨 No se puede crear el índice unique mientras existan duplicados.')
    console.log('   Resuelve manualmente antes de re-ejecutar con --apply.')
    await mongoose.disconnect()
    process.exit(1)
  }
  console.log('  Sin duplicados ✓\n')

  // 2. Listar índices actuales
  const idxActuales = await Subscription.collection.indexes()
  console.log('→ Índices actuales:')
  for (const i of idxActuales) console.log('  ', i.name, JSON.stringify(i.key), i.partialFilterExpression ?? '')
  console.log()

  const yaExiste = idxActuales.some(
    (i) =>
      i.partialFilterExpression
      && i.partialFilterExpression.estado === 'pendiente_pago'
      && i.unique === true
  )
  if (yaExiste) {
    console.log('✓ Índice unique pendiente_pago ya existe. Nada que hacer.')
    await mongoose.disconnect()
    return
  }

  if (!APPLY) {
    console.log('🔍 DRY-RUN. Re-ejecuta con --apply para crear el índice:')
    console.log('   { workshopId:1, studentId:1, dependentId:1, estado:1 }')
    console.log('   unique partial { estado: "pendiente_pago" }')
    await mongoose.disconnect()
    return
  }

  console.log('→ Creando índice...')
  await Subscription.collection.createIndex(
    { workshopId: 1, studentId: 1, dependentId: 1, estado: 1 },
    {
      unique: true,
      partialFilterExpression: { estado: 'pendiente_pago' },
      name: 'unique_pendiente_pago_por_dependent',
    }
  )
  console.log('✓ Índice creado\n')

  const idxFinal = await Subscription.collection.indexes()
  console.log('→ Índices finales:')
  for (const i of idxFinal) console.log('  ', i.name)

  await mongoose.disconnect()
  console.log('\n✅ Listo')
}

main().catch((e) => {
  console.error('❌', e)
  process.exit(1)
})
