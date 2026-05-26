/**
 * Audita y corrige créditos no devueltos cuando el tallerista anuló clases.
 * Bug: antes del fix, al cancelar un slot, los enrollments puntuales no se
 * cancelaban ni se devolvía el crédito al alumno.
 *
 * Uso:
 *   node _fix_creditos_anulaciones_tallerista.mjs               ← dry-run
 *   node _fix_creditos_anulaciones_tallerista.mjs --aplicar     ← aplica los cambios
 */

import { readFileSync } from 'fs'
import mongoose from 'mongoose'

const APLICAR = process.argv.includes('--aplicar')
const EMAIL_TALLERISTA = 'miseal@gmail.com'

// --- Leer .env.local ---
let uri = ''
try {
  const envContent = readFileSync('.env.local', 'utf-8')
  const match = envContent.match(/^MONGODB_URI=(.+)$/m)
  if (match) uri = match[1].trim()
} catch {
  console.error('❌ No se encontró .env.local')
  process.exit(1)
}
if (!uri) { console.error('❌ MONGODB_URI no definida'); process.exit(1) }

await mongoose.connect(uri)
const db = mongoose.connection.db
console.log(`✅ Conectado a: ${mongoose.connection.db.databaseName}`)
console.log(`📧 Tallerista: ${EMAIL_TALLERISTA}`)
console.log(APLICAR ? '🔧 MODO: APLICAR cambios' : '🔍 MODO: dry-run (usa --aplicar para ejecutar)')
console.log('─'.repeat(60))

// 1. Encontrar al tallerista
const tallerista = await db.collection('users').findOne({ email: EMAIL_TALLERISTA })
if (!tallerista) { console.error('❌ Usuario no encontrado'); process.exit(1) }
console.log(`👤 Usuario: ${tallerista.name ?? tallerista.nombre} (${tallerista._id})`)

// 2. Workshops del tallerista
const workshops = await db.collection('workshops').find({
  ownerId: tallerista._id,
  activo: true,
}).toArray()
console.log(`🎹 Workshops encontrados: ${workshops.length}`)

// 3. Para cada workshop, buscar slots cancelados y enrollments afectados
let totalAfectados = 0
const afectados = []

for (const ws of workshops) {
  if (!ws.slots || ws.slots.length === 0) continue

  const slotsCancelados = ws.slots
    .map((s, i) => ({ slot: s, index: i }))
    .filter(({ slot }) => slot.cancelado === true)

  if (slotsCancelados.length === 0) continue

  for (const { slot, index } of slotsCancelados) {
    // Enrollments aún en estado 'pagado' para este slot cancelado (afectados por el bug)
    const enrollments = await db.collection('enrollments').find({
      workshopId: ws._id,
      slotIndex: index,
      estado: 'pagado',
      activo: true,
    }).toArray()

    for (const e of enrollments) {
      // Solo enrollments de checkout con monto real
      if (e.origenInscripcion === 'manual') continue
      if (!e.monto || e.monto <= 0) continue

      // Verificar que no existe ya un reembolso para este enrollment
      const yaReembolsado = await db.collection('credittransactions').findOne({
        enrollmentId: e._id,
        tipo: 'reembolso',
      })
      if (yaReembolsado) {
        console.log(`  ⚠️  Enrollment ${e._id} ya tiene reembolso, saltando`)
        continue
      }

      const alumno = await db.collection('users').findOne({ _id: e.studentId })
      const fechaSlot = slot.fecha
        ? new Date(slot.fecha).toLocaleDateString('es-CL')
        : slot.dia ?? `slot[${index}]`

      afectados.push({ enrollment: e, alumno, workshop: ws, fechaSlot, slotIndex: index })
      totalAfectados++
    }
  }
}

// 4. Mostrar resumen
console.log(`\n📋 ENROLLMENTS AFECTADOS POR EL BUG: ${totalAfectados}`)
console.log('─'.repeat(60))

if (totalAfectados === 0) {
  console.log('✅ No hay enrollments afectados. Nada que corregir.')
  await mongoose.disconnect()
  process.exit(0)
}

for (const { enrollment: e, alumno, workshop: ws, fechaSlot } of afectados) {
  const alumnoNombre = alumno?.name ?? alumno?.nombre ?? String(e.studentId)
  const dependente = e.dependentNombreSnapshot ? ` (para: ${e.dependentNombreSnapshot})` : ''
  console.log(`  • ${ws.titulo}`)
  console.log(`    Fecha slot: ${fechaSlot}  |  Alumno: ${alumnoNombre}${dependente}`)
  console.log(`    Enrollment: ${e._id}  |  Monto a devolver: $${e.monto.toLocaleString('es-CL')} CLP`)
  console.log(`    Crédito actual del alumno: $${(alumno?.creditoDisponible ?? 0).toLocaleString('es-CL')} CLP`)
  console.log()
}

const totalCLP = afectados.reduce((acc, { enrollment: e }) => acc + e.monto, 0)
console.log(`💰 TOTAL CRÉDITO A DEVOLVER: $${totalCLP.toLocaleString('es-CL')} CLP`)
console.log('─'.repeat(60))

if (!APLICAR) {
  console.log('\n⚠️  dry-run — ejecuta con --aplicar para aplicar los cambios')
  await mongoose.disconnect()
  process.exit(0)
}

// 5. Aplicar: cancelar enrollments + otorgar crédito
console.log('\n🔧 Aplicando correcciones...\n')

for (const { enrollment: e, alumno, workshop: ws, fechaSlot } of afectados) {
  const alumnoNombre = alumno?.name ?? alumno?.nombre ?? String(e.studentId)
  try {
    // 5a. Cancelar enrollment
    await db.collection('enrollments').updateOne(
      { _id: e._id },
      { $set: { estado: 'cancelado' } }
    )

    // 5b. Obtener saldo actual
    const userFresh = await db.collection('users').findOne({ _id: e.studentId })
    const saldoAnterior = userFresh?.creditoDisponible ?? 0
    const saldoNuevo = saldoAnterior + e.monto

    // 5c. Actualizar creditoDisponible del alumno
    await db.collection('users').updateOne(
      { _id: e.studentId },
      { $inc: { creditoDisponible: e.monto } }
    )

    // 5d. Crear CreditTransaction (append-only)
    await db.collection('credittransactions').insertOne({
      userId:          e.studentId,
      tipo:            'reembolso',
      monto:           e.monto,
      saldoResultante: saldoNuevo,
      enrollmentId:    e._id,
      motivo:          `Reembolso retroactivo por cancelación de clase por el tallerista (${ws.titulo} — ${fechaSlot})`,
      createdAt:       new Date(),
      updatedAt:       new Date(),
    })

    console.log(`  ✅ ${alumnoNombre}: +$${e.monto.toLocaleString('es-CL')} CLP → saldo: $${saldoNuevo.toLocaleString('es-CL')}`)
  } catch (err) {
    console.error(`  ❌ Error en enrollment ${e._id}: ${err.message}`)
  }
}

console.log(`\n✅ Corrección completa. ${afectados.length} créditos devueltos.`)
await mongoose.disconnect()
