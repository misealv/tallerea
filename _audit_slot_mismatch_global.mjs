/**
 * AUDITORÍA GLOBAL: detectar enrollments cuyo slotIndex NO coincide con su slotFecha.
 *
 * Bug del picker: en talleres con slots expandidos (cada slot con fecha concreta),
 * el picker reproyectaba por día de semana y podía asignar el slotIndex de la
 * primera semana a una fecha futura distinta. Resultado: el enrollment apunta a
 * un slot con la hora correcta pero la FECHA equivocada.
 *
 * Este script NO modifica nada. Solo reporta.
 */
import mongoose from 'mongoose'
import 'dotenv/config'

await mongoose.connect(process.env.MONGODB_URI)
const db = mongoose.connection.db

const ymd = (d) => d ? new Date(d).toISOString().slice(0, 10) : null

// Todos los enrollments activos con slotFecha y slotIndex no nulos
const enrollments = await db.collection('enrollments').find({
  slotIndex: { $ne: null },
  slotFecha: { $exists: true, $ne: null },
  estado: { $ne: 'cancelado' },
  activo: true,
}).toArray()

console.log(`Enrollments con slotIndex+slotFecha (activos, no cancelados): ${enrollments.length}\n`)

// Cache de workshops
const wsCache = new Map()
async function getWs(id) {
  const k = String(id)
  if (!wsCache.has(k)) wsCache.set(k, await db.collection('workshops').findOne({ _id: id }))
  return wsCache.get(k)
}

const problemas = []

for (const e of enrollments) {
  const w = await getWs(e.workshopId)
  if (!w || !Array.isArray(w.slots) || w.slots.length === 0) continue

  const slot = w.slots[e.slotIndex]
  if (!slot) {
    problemas.push({ tipo: 'slotIndex_fuera_rango', e, w })
    continue
  }

  // Solo aplica a slots expandidos (con fecha). Si el slot no tiene fecha, no es modo expandido.
  if (!slot.fecha) continue

  const slotYMD = ymd(slot.fecha)
  const enrollYMD = ymd(e.slotFecha)

  if (slotYMD !== enrollYMD) {
    // Buscar el índice correcto: mismo horaInicio + horaFin + fecha === slotFecha
    let correctIdx = -1
    for (let i = 0; i < w.slots.length; i++) {
      const s = w.slots[i]
      if (s.fecha && ymd(s.fecha) === enrollYMD && s.horaInicio === slot.horaInicio && s.horaFin === slot.horaFin) {
        correctIdx = i; break
      }
    }
    problemas.push({ tipo: 'fecha_mismatch', e, w, slotYMD, enrollYMD, correctIdx, slot })
  }
}

console.log(`=== PROBLEMAS DETECTADOS: ${problemas.length} ===\n`)

for (const p of problemas) {
  const u = await db.collection('users').findOne({ _id: p.e.studentId })
  if (p.tipo === 'slotIndex_fuera_rango') {
    console.log(`⚠️  slotIndex fuera de rango`)
    console.log(`   enrollment=${p.e._id} student=${u?.name} taller="${p.w.titulo}" slotIndex=${p.e.slotIndex} (slots.length=${p.w.slots.length})`)
  } else {
    console.log(`❌ FECHA MISMATCH`)
    console.log(`   enrollment=${p.e._id}`)
    console.log(`   student=${u?.name} <${u?.email}>`)
    console.log(`   taller="${p.w.titulo}"`)
    console.log(`   esClasePrueba=${p.e.esClasePrueba} origen=${p.e.origenInscripcion} estado=${p.e.estado}`)
    console.log(`   slotIndex actual=${p.e.slotIndex} → slot.fecha=${p.slotYMD} ${p.slot.horaInicio}-${p.slot.horaFin}`)
    console.log(`   slotFecha elegida=${p.enrollYMD}`)
    console.log(`   slotIndex correcto=${p.correctIdx >= 0 ? p.correctIdx : 'NO ENCONTRADO'}`)
  }
  console.log('')
}

if (problemas.length === 0) {
  console.log('✅ No hay enrollments con mismatch fecha/slotIndex.')
}

await mongoose.disconnect()
