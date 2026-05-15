import 'dotenv/config'
import mongoose from 'mongoose'

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db

  const subIds = [
    '6a06626ba7c917e61e7a5165', // Fernando
    '6a06626aa7c917e61e7a5157', // Juan Pablo
  ].map(id => new mongoose.Types.ObjectId(id))

  // Validar antes
  const before = await db.collection('subscriptions').find({ _id: { $in: subIds } }).toArray()
  console.log('\n=== ANTES ===')
  before.forEach(s => {
    console.log(`  ${s.dependentNombreSnapshot}: ${s.sesionesUsadas}/${s.sesionesTotales} (disp=${s.sesionesDisponibles})`)
  })

  // Solo update si sesionesUsadas === 0 (nadie ha consumido)
  const safe = before.every(s => s.sesionesUsadas === 0)
  if (!safe) { console.error('ABORT: alguna sub tiene sesionesUsadas > 0'); process.exit(1) }

  const res = await db.collection('subscriptions').updateMany(
    { _id: { $in: subIds }, sesionesUsadas: 0 },
    { $set: { sesionesTotales: 4, sesionesDisponibles: 4 } }
  )
  console.log(`\nActualizadas: ${res.modifiedCount}`)

  const after = await db.collection('subscriptions').find({ _id: { $in: subIds } }).toArray()
  console.log('\n=== DESPUÉS ===')
  after.forEach(s => {
    console.log(`  ${s.dependentNombreSnapshot}: ${s.sesionesUsadas}/${s.sesionesTotales} (disp=${s.sesionesDisponibles})  monto=${s.monto}  precioSnapshot=${s.precioSnapshot}`)
  })

  await mongoose.disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
