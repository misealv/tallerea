import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

import mongoose from 'mongoose'
import dbConnect from '../src/lib/db'
import Subscription from '../src/models/Subscription'
import Enrollment from '../src/models/Enrollment'

async function main() {
  await dbConnect()

  // 1. Cancelar las 2 Subscriptions fantasma ($64k y $71k) — pre-refactor
  const subIds = ['69ec3f9779a7a239e6d2c3a2', '69ec6d48f96282363c6487c6']
  for (const id of subIds) {
    const s = await Subscription.findById(id).lean<{ monto: number; studentId: mongoose.Types.ObjectId }>()
    if (!s) { console.log(`Sub ${id}: no encontrada`); continue }
    await Subscription.updateOne({ _id: id }, { estado: 'cancelada' })
    console.log(`✓ Subscription ${id} cancelada ($${s.monto})`)
  }

  // 2. Cancelar los 2 Enrollments viejos del 23-abr ($17k y $60k) — >2 días sin pago
  const enrollOldIds = ['69e9c739efe3b762b610f761', '69e9cb4c1c5ef60a7c7d1094']
  for (const id of enrollOldIds) {
    const e = await Enrollment.findById(id).lean<{
      monto: number;
      studentId: mongoose.Types.ObjectId;
      workshopId: mongoose.Types.ObjectId;
      slotIndex: number | null;
    }>()
    if (!e) { console.log(`Enr ${id}: no encontrado`); continue }
    await Enrollment.updateOne({ _id: id, estado: 'pendiente' }, { estado: 'cancelado' })
    console.log(`✓ Enrollment ${id} cancelado ($${e.monto})`)
  }

  console.log('\n⚠️  DEJADOS SIN TOCAR: 2 enrollments de $150 (clase de prueba, hoy ~1h)')
  console.log('  - 69ec72019a02d90530d97fe0 (07:49 UTC)')
  console.log('  - 69ec72ef70cd20eab3c797c4 (07:53 UTC)')
  console.log('  Si en el panel de MercadoPago aparecen como "aprobados":')
  console.log('    → curl -X POST https://tallerea.cl/api/payments/verify -H "Content-Type: application/json" -d \'{"paymentId":"<ID_MP>"}\' ')
  console.log('  Si aparecen como "cancelados/rechazados":')
  console.log('    → npx tsx scripts/cleanupOrphanPayments.ts --apply  (mañana)')
  console.log('\n[CLEANUP] Completado.')
  process.exit(0)
}

main().catch(err => { console.error('[ERROR]', err); process.exit(1) })
