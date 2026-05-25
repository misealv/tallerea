/**
 * Corrige retroactivamente las sesiones no devueltas cuando el tallerista
 * canceló reservas individuales de alumnos (vía calendar/students).
 * Bug: devolverSesion nunca se llamaba desde ese endpoint.
 *
 * Uso:
 *   node _fix_sesiones_canceladas_tallerista.mjs               ← dry-run
 *   node _fix_sesiones_canceladas_tallerista.mjs --aplicar     ← aplica cambios
 */

import { readFileSync } from 'fs'
import mongoose from 'mongoose'

const APLICAR = process.argv.includes('--aplicar')
const EMAIL_TALLERISTA = 'miseal@gmail.com'

let uri = ''
try {
  const envContent = readFileSync('.env.local', 'utf-8')
  const match = envContent.match(/^MONGODB_URI=(.+)$/m)
  if (match) uri = match[1].trim()
} catch { console.error('❌ No se encontró .env.local'); process.exit(1) }
if (!uri) { console.error('❌ MONGODB_URI no definida'); process.exit(1) }

await mongoose.connect(uri)
const db = mongoose.connection.db
console.log(`✅ Conectado a: ${mongoose.connection.db.databaseName}`)
console.log(APLICAR ? '🔧 MODO: APLICAR' : '🔍 MODO: dry-run (usa --aplicar para ejecutar)')
console.log('─'.repeat(60))

const tallerista = await db.collection('users').findOne({ email: EMAIL_TALLERISTA })
if (!tallerista) { console.error('❌ Usuario no encontrado'); process.exit(1) }

const workshops = await db.collection('workshops').find({
  ownerId: tallerista._id,
  activo: true,
}).toArray()

// Reunir todas las subscripciones que tienen bookings cancelados por tallerista
const bksTallerista = await db.collection('bookings').find({
  workshopId: { $in: workshops.map(w => w._id) },
  canceladaRazon: 'tallerista',
}).toArray()

const subIds = [...new Set(bksTallerista.map(b => String(b.subscriptionId)).filter(Boolean))]

const correcciones = []

for (const subIdStr of subIds) {
  const subId = new mongoose.Types.ObjectId(subIdStr)
  const sub = await db.collection('subscriptions').findOne({ _id: subId })
  if (!sub) continue

  const alumno = await db.collection('users').findOne({ _id: sub.studentId }, { projection: { name: 1, email: 1 } })

  // Contar bookings NO cancelados (estos SÍ consumen sesión)
  const allBks = await db.collection('bookings').find({ subscriptionId: subId }).toArray()
  const activosCount = allBks.filter(b => b.estado !== 'cancelada').length

  // Discrepancia real = sesionesUsadas - bookings activos
  const discrepancia = sub.sesionesUsadas - activosCount

  if (discrepancia <= 0) continue // nada que corregir

  // Verificar que la discrepancia no supere los bookings cancelados por tallerista
  const canceladosPorTallerista = allBks.filter(b => b.canceladaRazon === 'tallerista').length
  const sesionesADevolver = Math.min(discrepancia, canceladosPorTallerista)

  correcciones.push({
    sub, alumno, subIdStr, sesionesADevolver, discrepancia,
    canceladosPorTallerista, activosCount,
    slots: bksTallerista.filter(b => String(b.subscriptionId) === subIdStr).map(b => b.slotIndex)
  })
}

console.log(`\n📋 SUBSCRIPCIONES A CORREGIR: ${correcciones.length}`)
console.log('─'.repeat(60))

if (correcciones.length === 0) {
  console.log('✅ No hay discrepancias. Nada que corregir.')
  await mongoose.disconnect()
  process.exit(0)
}

for (const c of correcciones) {
  console.log(`\n👤 ${c.alumno?.name} (${c.alumno?.email})`)
  console.log(`   Sub: ${c.subIdStr}`)
  console.log(`   sesionesUsadas=${c.sub.sesionesUsadas} | bookings activos=${c.activosCount} | discrepancia=${c.discrepancia}`)
  console.log(`   Bookings cancelados por tallerista: ${c.canceladosPorTallerista} (slots: ${c.slots.join(', ')})`)
  console.log(`   ✏️  Sesiones a devolver: ${c.sesionesADevolver}`)
  console.log(`   Antes: disp=${c.sub.sesionesDisponibles} usadas=${c.sub.sesionesUsadas}`)
  console.log(`   Después: disp=${c.sub.sesionesDisponibles + c.sesionesADevolver} usadas=${c.sub.sesionesUsadas - c.sesionesADevolver}`)
}

const total = correcciones.reduce((acc, c) => acc + c.sesionesADevolver, 0)
console.log(`\n📦 Total sesiones a devolver: ${total}`)
console.log('─'.repeat(60))

if (!APLICAR) {
  console.log('\n⚠️  dry-run — ejecuta con --aplicar para corregir')
  await mongoose.disconnect()
  process.exit(0)
}

console.log('\n🔧 Aplicando correcciones...\n')

for (const c of correcciones) {
  try {
    // Aplicar devolverSesion N veces (atómico, con guarda sesionesUsadas > 0)
    for (let i = 0; i < c.sesionesADevolver; i++) {
      await db.collection('subscriptions').updateOne(
        { _id: c.sub._id, sesionesUsadas: { $gt: 0 } },
        { $inc: { sesionesUsadas: -1, sesionesDisponibles: 1 } }
      )
    }

    const subActual = await db.collection('subscriptions').findOne({ _id: c.sub._id })
    console.log(`  ✅ ${c.alumno?.name}: +${c.sesionesADevolver} sesiones → disp=${subActual.sesionesDisponibles} usadas=${subActual.sesionesUsadas}`)
  } catch (err) {
    console.error(`  ❌ Error en sub ${c.subIdStr}: ${err.message}`)
  }
}

console.log(`\n✅ Corrección completa. ${correcciones.length} suscripciones corregidas.`)
await mongoose.disconnect()
