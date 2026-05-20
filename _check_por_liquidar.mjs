// Lista pagos cobrados sin liquidar, agrupados por tallerista.
// Útil para saber qué período usar al generar liquidaciones manuales.
// Uso: node _check_por_liquidar.mjs

import { config } from 'dotenv'
import mongoose from 'mongoose'

config({ path: '.env.local' })

const PbSchema = new mongoose.Schema({}, { strict: false, collection: 'paymentbreakdowns' })
const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'users' })
const Pb = mongoose.model('PaymentBreakdown', PbSchema)
const User = mongoose.model('User', UserSchema)

await mongoose.connect(process.env.MONGODB_URI)

const pendientes = await Pb.find({
  estado: 'cobrado',
  liquidationId: { $exists: false },
}).sort({ fechaCobro: 1 }).lean()

const byOwner = new Map()
for (const p of pendientes) {
  const k = String(p.ownerId)
  if (!byOwner.has(k)) byOwner.set(k, { items: [], total: 0 })
  const g = byOwner.get(k)
  g.items.push(p)
  g.total += p.montoProfesor
}

console.log(`\n=== Pagos pendientes de liquidar: ${pendientes.length} ===\n`)

for (const [ownerId, g] of byOwner) {
  const u = await User.findById(ownerId).select('name email').lean()
  const fechas = g.items.map(i => new Date(i.fechaCobro))
  const min = new Date(Math.min(...fechas))
  const max = new Date(Math.max(...fechas))
  console.log(`• ${u?.name ?? ownerId}  (${u?.email ?? '-'})`)
  console.log(`    ${g.items.length} pagos | total profesor: $${g.total.toLocaleString('es-CL')}`)
  console.log(`    Período sugerido: ${min.toISOString().slice(0,10)}  →  ${max.toISOString().slice(0,10)}`)
  console.log(`    ownerId: ${ownerId}\n`)
}

if (pendientes.length === 0) console.log('Sin pagos pendientes.\n')

await mongoose.disconnect()
