import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

import mongoose from 'mongoose'
import dbConnect from '../src/lib/db'
import User from '../src/models/User'
import Enrollment from '../src/models/Enrollment'
import Subscription from '../src/models/Subscription'
import PaymentBreakdown from '../src/models/PaymentBreakdown'
import CreditTransaction from '../src/models/CreditTransaction'
import Workshop from '../src/models/Workshop'

const TARGET_EMAIL = 'miseal@ug.uchile.cl'
const DRY = !process.argv.includes('--apply')

async function main() {
  await dbConnect()

  const user = await User.findOne({ email: TARGET_EMAIL }).lean<{
    _id: mongoose.Types.ObjectId; name: string; email: string; creditoDisponible?: number
  }>()
  if (!user) { console.log('Usuario no encontrado'); process.exit(0) }

  console.log(`\nUsuario: ${user._id} | ${user.name} | crédito=$${user.creditoDisponible ?? 0}`)
  console.log(`Modo: ${DRY ? 'DRY-RUN' : 'APLICAR'}\n`)

  const uid = user._id

  const [enrolls, subs, breakdowns, credits] = await Promise.all([
    Enrollment.find({ studentId: uid }).lean<{
      _id: mongoose.Types.ObjectId; estado: string; monto: number;
      workshopId: mongoose.Types.ObjectId; slotIndex: number | null;
      esClasePrueba?: boolean; activo: boolean
    }[]>(),
    Subscription.find({ studentId: uid }).lean<{
      _id: mongoose.Types.ObjectId; estado: string; monto: number; workshopId: mongoose.Types.ObjectId
    }[]>(),
    PaymentBreakdown.find({ studentId: uid }).lean<{
      _id: mongoose.Types.ObjectId; estado: string; montoBruto: number; mercadoPagoId?: string
    }[]>(),
    CreditTransaction.find({ userId: uid }).lean<{
      _id: mongoose.Types.ObjectId; tipo: string; monto: number
    }[]>(),
  ])

  console.log(`Enrollments (${enrolls.length}):`)
  enrolls.forEach(e => console.log(`  ${e._id} | ${e.estado} | $${e.monto} | slot=${e.slotIndex} | prueba=${e.esClasePrueba} | activo=${e.activo}`))
  console.log(`\nSubscriptions (${subs.length}):`)
  subs.forEach(s => console.log(`  ${s._id} | ${s.estado} | $${s.monto}`))
  console.log(`\nPaymentBreakdowns (${breakdowns.length}):`)
  breakdowns.forEach(b => console.log(`  ${b._id} | ${b.estado} | $${b.montoBruto} | mpId=${b.mercadoPagoId ?? 'ninguno'}`))
  console.log(`\nCreditTransactions (${credits.length}):`)
  credits.forEach(c => console.log(`  ${c._id} | ${c.tipo} | $${c.monto}`))

  if (DRY) {
    console.log('\n[DRY-RUN] Re-ejecutar con --apply para borrar todo.')
    process.exit(0)
  }

  console.log('\n[APPLY] Borrando...\n')

  // 1. Liberar cupos de cada enrollment activo/pendiente antes de borrar
  for (const e of enrolls) {
    if (['pagado', 'pendiente'].includes(e.estado) && e.activo) {
      if (e.slotIndex !== null && e.slotIndex !== undefined) {
        const workshop = await Workshop.findById(e.workshopId).select('slots').lean<{ slots?: { cupoDisponible?: number }[] }>()
        const slot = workshop?.slots?.[e.slotIndex]
        if (slot) {
          const incOp = slot.cupoDisponible !== undefined
            ? { [`slots.${e.slotIndex}.cupoDisponible`]: 1 }
            : { [`slots.${e.slotIndex}.reservas`]: -1 }
          await Workshop.updateOne({ _id: e.workshopId }, { $inc: incOp })
          console.log(`  ↩ Cupo liberado en slot ${e.slotIndex}`)
        }
      }
    }
  }

  // 2. Borrar enrollments (hard delete para reset limpio de prueba)
  const delEnroll = await Enrollment.deleteMany({ studentId: uid })
  console.log(`  ✓ Enrollments eliminados: ${delEnroll.deletedCount}`)

  // 3. Borrar subscriptions
  const delSub = await Subscription.deleteMany({ studentId: uid })
  console.log(`  ✓ Subscriptions eliminadas: ${delSub.deletedCount}`)

  // 4. Borrar PaymentBreakdowns (solo los de prueba — sin mercadoPagoId real confirmado)
  const delBD = await PaymentBreakdown.deleteMany({
    studentId: uid,
    $or: [{ mercadoPagoId: { $exists: false } }, { mercadoPagoId: null }, { mercadoPagoId: '' }],
  })
  console.log(`  ✓ PaymentBreakdowns sin pago MP eliminados: ${delBD.deletedCount}`)

  // 5. Borrar crédito acumulado en transacciones de prueba
  const delCredit = await CreditTransaction.deleteMany({ userId: uid })
  console.log(`  ✓ CreditTransactions eliminadas: ${delCredit.deletedCount}`)

  // 6. Resetear crédito disponible en el User
  await User.updateOne({ _id: uid }, { creditoDisponible: 0 })
  console.log(`  ✓ creditoDisponible del usuario reseteado a $0`)

  console.log('\n[RESET] Listo. El usuario puede inscribirse a una clase de prueba nuevamente.\n')
  process.exit(0)
}

main().catch(e => { console.error('[ERROR]', e); process.exit(1) })
