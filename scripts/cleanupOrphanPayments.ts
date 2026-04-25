// Script de limpieza de Subscriptions/Enrollments huérfanos sin pago confirmado.
// Detecta:
//   - Subscriptions estado 'activa' sin pagoRef con createdAt > 1h
//   - Enrollments estado 'pendiente' con createdAt > 1h (que el sweep no alcanzó por inactividad)
// Acción: marca como 'cancelado'/'cancelada' (libera cupos) + audit log.
//
// Uso:
//   npx tsx scripts/cleanupOrphanPayments.ts            # dry-run (default)
//   npx tsx scripts/cleanupOrphanPayments.ts --apply    # aplica cambios

import 'dotenv/config'
import mongoose from 'mongoose'
import dbConnect from '../src/lib/db'
import Subscription from '../src/models/Subscription'
import Enrollment from '../src/models/Enrollment'
import Workshop from '../src/models/Workshop'
import FinanceAuditLog from '../src/models/FinanceAuditLog'

const APPLY = process.argv.includes('--apply')

async function main() {
  await dbConnect()
  const cutoff = new Date(Date.now() - 60 * 60 * 1000) // 1h

  console.log(`\n[CLEANUP] Modo: ${APPLY ? 'APLICAR' : 'DRY-RUN (no modifica)'}`)
  console.log(`[CLEANUP] Cutoff: ${cutoff.toISOString()}\n`)

  // 1. Subscriptions huérfanas (pendiente_pago antiguas o activa sin pagoRef — legacy pre-refactor)
  const orphanSubs = await Subscription.find({
    activo: true,
    createdAt: { $lt: cutoff },
    $or: [
      { estado: 'pendiente_pago' },
      { estado: 'activa', $or: [{ pagoRef: { $exists: false } }, { pagoRef: null }, { pagoRef: '' }] },
    ],
  }).lean<{ _id: mongoose.Types.ObjectId; estado: string; workshopId: mongoose.Types.ObjectId; studentId: mongoose.Types.ObjectId; monto: number; createdAt: Date }[]>()

  console.log(`Subscriptions huérfanas encontradas: ${orphanSubs.length}`)
  for (const s of orphanSubs) {
    console.log(`  - ${s._id} | estado=${s.estado} | workshop=${s.workshopId} | student=${s.studentId} | monto=$${s.monto} | ${s.createdAt.toISOString()}`)
  }

  // 2. Enrollments huérfanos (estado 'pendiente' antiguos)
  const orphanEnrolls = await Enrollment.find({
    estado: 'pendiente',
    activo: true,
    createdAt: { $lt: cutoff },
  }).lean<{ _id: mongoose.Types.ObjectId; workshopId: mongoose.Types.ObjectId; studentId: mongoose.Types.ObjectId; slotIndex: number | null; monto: number; createdAt: Date; esClasePrueba: boolean }[]>()

  console.log(`\nEnrollments huérfanos encontrados: ${orphanEnrolls.length}`)
  for (const e of orphanEnrolls) {
    console.log(`  - ${e._id} | workshop=${e.workshopId} | student=${e.studentId} | slot=${e.slotIndex} | monto=$${e.monto} | prueba=${e.esClasePrueba} | ${e.createdAt.toISOString()}`)
  }

  if (!APPLY) {
    console.log('\n[DRY-RUN] No se aplicaron cambios. Re-ejecutar con --apply.\n')
    process.exit(0)
  }

  console.log('\n[APPLY] Aplicando cambios...\n')

  // Cancelar Subscriptions
  for (const s of orphanSubs) {
    await Subscription.updateOne({ _id: s._id }, { estado: 'cancelada' })
    await FinanceAuditLog.create({
      accion: 'ajuste',
      entidadTipo: 'Subscription',
      entidadId: s._id,
      montoAnterior: s.monto,
      montoNuevo: 0,
      userId: s.studentId,
      metadata: { razon: 'Subscription huérfana sin pagoRef — cancelada por cleanup' },
    })
    console.log(`  ✓ Subscription ${s._id} cancelada`)
  }

  // Cancelar Enrollments + liberar cupos
  for (const e of orphanEnrolls) {
    const updated = await Enrollment.updateOne(
      { _id: e._id, estado: 'pendiente' },
      { estado: 'cancelado' }
    )
    if (updated.modifiedCount === 0) continue

    if (e.slotIndex !== null) {
      const workshop = await Workshop.findById(e.workshopId).select('slots').lean<{ slots?: { cupoDisponible?: number }[] }>()
      const slot = workshop?.slots?.[e.slotIndex]
      const incOp = slot && slot.cupoDisponible !== undefined
        ? { [`slots.${e.slotIndex}.cupoDisponible`]: 1 }
        : { [`slots.${e.slotIndex}.reservas`]: -1 }
      await Workshop.updateOne({ _id: e.workshopId }, { $inc: incOp })
    } else {
      await Workshop.updateOne({ _id: e.workshopId }, { $inc: { cupoDisponible: 1 } })
    }

    await FinanceAuditLog.create({
      accion: 'ajuste',
      entidadTipo: 'Enrollment',
      entidadId: e._id,
      montoAnterior: e.monto,
      montoNuevo: 0,
      userId: e.studentId,
      metadata: { razon: 'Enrollment huérfano sin pago — cancelado por cleanup, cupo liberado' },
    })
    console.log(`  ✓ Enrollment ${e._id} cancelado, cupo liberado`)
  }

  console.log('\n[CLEANUP] Completado.\n')
  process.exit(0)
}

main().catch(err => {
  console.error('[CLEANUP ERROR]', err)
  process.exit(1)
})
