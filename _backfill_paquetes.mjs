// Backfill subs activas con datos legacy faltantes:
//
// REGLA 1: Si monto=0 y precioSnapshot>0 → monto = precioSnapshot
// REGLA 2: Si clasesPrepagadas.cantidad falta → cantidad = sesionesTotales
// REGLA 3: Si sesionesTotales !== clasesPrepagadas.cantidad → tomar el MÁXIMO
//          (no reducir consumos ya hechos)
//
// NO toca subs con precioSnapshot=0 → requieren decisión humana (tallerista debe
// acordar precio y editarlo desde el panel /tallerista/inscritos/[id]/reservas).
//
// Uso:
//   node _backfill_paquetes.mjs           # dry-run
//   node _backfill_paquetes.mjs --apply   # ejecuta cambios

import { config } from 'dotenv'
config({ path: '.env.local' })
import mongoose from 'mongoose'

const APPLY = process.argv.includes('--apply')

const SubSchema = new mongoose.Schema({}, { strict: false, collection: 'subscriptions' })
const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'users' })
const Subscription = mongoose.model('Subscription', SubSchema)
const User = mongoose.model('User', UserSchema)

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  console.log(`Modo: ${APPLY ? '🔧 APPLY' : '🔍 DRY-RUN'}\n`)

  const subs = await Subscription.find({ estado: 'activa', activo: true }).lean()

  const aplicables = []
  const requierenDecision = []

  for (const s of subs) {
    const cambios = {}
    const issues = []
    const cant = s.clasesPrepagadas?.cantidad

    // Regla 1
    if ((!s.monto || s.monto === 0) && s.precioSnapshot && s.precioSnapshot > 0) {
      cambios.monto = s.precioSnapshot
    }
    // Regla 2
    if (!cant && s.sesionesTotales > 0) {
      cambios['clasesPrepagadas.cantidad'] = s.sesionesTotales
    }
    // Regla 3
    if (cant && s.sesionesTotales !== cant) {
      const max = Math.max(cant, s.sesionesTotales)
      if (s.sesionesTotales !== max) cambios.sesionesTotales = max
      if (cant !== max) cambios['clasesPrepagadas.cantidad'] = max
      // sesionesDisponibles = max - sesionesUsadas
      const nuevasDisponibles = Math.max(0, max - (s.sesionesUsadas || 0))
      if (s.sesionesDisponibles !== nuevasDisponibles) cambios.sesionesDisponibles = nuevasDisponibles
    }

    if ((!s.precioSnapshot || s.precioSnapshot === 0) && (!s.monto || s.monto === 0)) {
      issues.push('sin precio (decisión humana)')
    }

    if (Object.keys(cambios).length > 0) {
      aplicables.push({ sub: s, cambios })
    }
    if (issues.length > 0 && Object.keys(cambios).length === 0) {
      requierenDecision.push({ sub: s, issues })
    } else if (issues.length > 0) {
      // Tiene cambios + issues no resolubles
      aplicables[aplicables.length - 1].issuesNoResueltos = issues
    }
  }

  // --- Reporte ---
  console.log(`Cambios automáticos: ${aplicables.length}\n`)
  for (const { sub, cambios, issuesNoResueltos } of aplicables) {
    const u = await User.findById(sub.studentId).select('name').lean()
    const tag = sub.dependentNombreSnapshot ? ` (${sub.dependentNombreSnapshot})` : ''
    console.log(`• ${u?.name}${tag} — sub ${sub._id}`)
    for (const [k, v] of Object.entries(cambios)) {
      const before = k.includes('.') ? sub.clasesPrepagadas?.[k.split('.')[1]] : sub[k]
      console.log(`    ${k}: ${before ?? 'undefined'} → ${v}`)
    }
    if (issuesNoResueltos) {
      console.log(`    ⚠️ Pendiente: ${issuesNoResueltos.join(', ')}`)
    }
  }

  console.log(`\nRequieren decisión humana (no se tocan): ${requierenDecision.length}`)
  for (const { sub, issues } of requierenDecision) {
    const u = await User.findById(sub.studentId).select('name').lean()
    const tag = sub.dependentNombreSnapshot ? ` (${sub.dependentNombreSnapshot})` : ''
    console.log(`  • ${u?.name}${tag} — ${issues.join(', ')}`)
    console.log(`    → Edita en /tallerista/inscritos/${sub.studentId}/reservas`)
  }

  if (!APPLY) {
    console.log('\n🔍 DRY-RUN. Re-ejecuta con --apply para guardar cambios.')
    await mongoose.disconnect()
    return
  }

  // --- Aplicar ---
  console.log('\n→ Aplicando...')
  for (const { sub, cambios } of aplicables) {
    const $set = {}
    for (const [k, v] of Object.entries(cambios)) $set[k] = v
    await Subscription.updateOne({ _id: sub._id }, { $set })
    console.log(`  ✓ ${sub._id}`)
  }
  console.log(`\n✅ ${aplicables.length} subs actualizadas`)
  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
