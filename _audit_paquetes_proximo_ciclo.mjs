// Audita que TODAS las subs activas tengan info clara del próximo ciclo:
// - clasesPrepagadas.cantidad definida y > 0
// - precioSnapshot definido (para generar link MP de renovación)
// - caducaEn presente (para saber cuándo cierra el ciclo)
// - sesionesTotales coherente con clasesPrepagadas.cantidad
//
// Lista cualquier sub que NO esté lista para renovarse limpiamente.

import { config } from 'dotenv'
config({ path: '.env.local' })
import mongoose from 'mongoose'

const SubSchema = new mongoose.Schema({}, { strict: false, collection: 'subscriptions' })
const WorkshopSchema = new mongoose.Schema({}, { strict: false, collection: 'workshops' })
const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'users' })
const Subscription = mongoose.model('Subscription', SubSchema)
const Workshop = mongoose.model('Workshop', WorkshopSchema)
const User = mongoose.model('User', UserSchema)

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  console.log('Conectado\n')

  const activas = await Subscription.find({ estado: 'activa', activo: true }).lean()
  console.log(`Total subs activas: ${activas.length}\n`)

  const problemas = []
  for (const s of activas) {
    const issues = []
    const cant = s.clasesPrepagadas?.cantidad
    if (!cant || cant <= 0) issues.push('sin clasesPrepagadas.cantidad')
    if (cant && s.sesionesTotales !== cant) issues.push(`sesionesTotales(${s.sesionesTotales}) ≠ clasesPrepagadas.cantidad(${cant})`)
    if (!s.precioSnapshot || s.precioSnapshot <= 0) issues.push('sin precioSnapshot')
    if (!s.clasesPrepagadas?.caducaEn && !s.fechaVencimiento) issues.push('sin caducaEn ni fechaVencimiento')
    if (!s.monto || s.monto <= 0) issues.push('sin monto')

    if (issues.length > 0) {
      const w = await Workshop.findById(s.workshopId).select('titulo slug').lean()
      const u = await User.findById(s.studentId).select('name email').lean()
      problemas.push({
        sub: String(s._id),
        alumno: u ? `${u.name} <${u.email}>` : String(s.studentId),
        menor: s.dependentNombreSnapshot ?? '(propio)',
        taller: w?.titulo ?? String(s.workshopId),
        clasesPrepagadas: cant,
        sesionesTotales: s.sesionesTotales,
        sesionesDisponibles: s.sesionesDisponibles,
        precioSnapshot: s.precioSnapshot,
        monto: s.monto,
        caducaEn: s.clasesPrepagadas?.caducaEn,
        fechaVencimiento: s.fechaVencimiento,
        autoRenovar: s.autoRenovar,
        issues,
      })
    }
  }

  if (problemas.length === 0) {
    console.log('✅ Todas las subs activas tienen paquete claro para próximo ciclo')
  } else {
    console.log(`⚠️  ${problemas.length}/${activas.length} subs con problemas:\n`)
    for (const p of problemas) {
      console.log(`Sub ${p.sub}`)
      console.log(`  Alumno:   ${p.alumno}`)
      console.log(`  Menor:    ${p.menor}`)
      console.log(`  Taller:   ${p.taller}`)
      console.log(`  Clases prepagadas / sesionesTotales / disponibles: ${p.clasesPrepagadas} / ${p.sesionesTotales} / ${p.sesionesDisponibles}`)
      console.log(`  precioSnapshot / monto:  ${p.precioSnapshot} / ${p.monto}`)
      console.log(`  caducaEn / fechaVenc:    ${p.caducaEn} / ${p.fechaVencimiento}`)
      console.log(`  autoRenovar: ${p.autoRenovar}`)
      console.log(`  Issues: ${p.issues.join(' | ')}\n`)
    }
  }

  // Bonus: subs próximas a vencer en los próximos 14 días
  console.log('\n→ Subs que vencen en próximos 14 días:')
  const en14d = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  const proximas = activas
    .filter(s => {
      const f = s.clasesPrepagadas?.caducaEn ?? s.fechaVencimiento
      return f && new Date(f) <= en14d
    })
    .sort((a, b) => {
      const fa = new Date(a.clasesPrepagadas?.caducaEn ?? a.fechaVencimiento).getTime()
      const fb = new Date(b.clasesPrepagadas?.caducaEn ?? b.fechaVencimiento).getTime()
      return fa - fb
    })

  if (proximas.length === 0) {
    console.log('  Ninguna')
  } else {
    for (const s of proximas) {
      const w = await Workshop.findById(s.workshopId).select('titulo').lean()
      const u = await User.findById(s.studentId).select('name').lean()
      const f = s.clasesPrepagadas?.caducaEn ?? s.fechaVencimiento
      console.log(`  ${new Date(f).toISOString().slice(0,10)} — ${u?.name} ${s.dependentNombreSnapshot ? `(${s.dependentNombreSnapshot})` : ''} — ${w?.titulo} — ${s.clasesPrepagadas?.cantidad} clases @ $${s.precioSnapshot}`)
    }
  }

  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
