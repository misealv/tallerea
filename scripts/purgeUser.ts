/**
 * purgeUser.ts
 * Elimina en cascada un usuario específico + sus dependientes,
 * y opcionalmente limpia TODOS los Bookings del sistema (huérfanos incluidos).
 *
 * USO:
 *   npx tsx scripts/purgeUser.ts --dry-run   ← solo cuenta, no borra
 *   npx tsx scripts/purgeUser.ts              ← borra de verdad
 */

import 'dotenv/config'
import mongoose from 'mongoose'

const TARGET_EMAIL = 'miguel.antonio.sepulveda.alvarez@gmail.com'
const DRY_RUN = process.argv.includes('--dry-run')

const S = new mongoose.Schema({}, { strict: false })
const User             = mongoose.models.User             || mongoose.model('User',             S.clone())
const Subscription     = mongoose.models.Subscription     || mongoose.model('Subscription',     S.clone())
const Enrollment       = mongoose.models.Enrollment       || mongoose.model('Enrollment',       S.clone())
const Booking          = mongoose.models.Booking          || mongoose.model('Booking',          S.clone())
const PaymentBreakdown = mongoose.models.PaymentBreakdown || mongoose.model('PaymentBreakdown', S.clone())
const Review           = mongoose.models.Review           || mongoose.model('Review',           S.clone())
const ManualPaymentRecord = mongoose.models.ManualPaymentRecord || mongoose.model('ManualPaymentRecord', S.clone())
const CreditTransaction   = mongoose.models.CreditTransaction   || mongoose.model('CreditTransaction',   S.clone())
const FinanceAuditLog     = mongoose.models.FinanceAuditLog     || mongoose.model('FinanceAuditLog',     S.clone())

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!)
  console.log('✅ Conectado a MongoDB')
  console.log(DRY_RUN ? '🔍 DRY-RUN — no se borra nada\n' : '🔴 MODO REAL — borrando...\n')

  // 1. Buscar usuario
  const user = await User.findOne({ email: TARGET_EMAIL }).lean<any>()
  if (!user) { console.log(`❌ Usuario ${TARGET_EMAIL} no encontrado`); process.exit(0) }
  const userId = user._id
  console.log(`👤 Usuario: ${TARGET_EMAIL} → ${userId}`)

  // 2. Buscar dependientes — almacenados como sub-docs en User.dependents
  const dependientes: any[] = user.dependents ?? []
  const depIds = dependientes.map((d: any) => d._id)
  console.log(`👧 Dependientes: ${dependientes.map((d: any) => d.nombre).join(', ') || 'ninguno'}`)

  // 3. Subscriptions del usuario (como titular o como studentId)
  const subs = await Subscription.find({
    $or: [
      { studentId: userId },
      { dependentId: { $in: depIds } },
    ]
  }).lean<any[]>()
  const subIds = subs.map(s => s._id)

  // 4. Enrollments del usuario
  const enrolls = await Enrollment.find({ studentId: userId }).lean<any[]>()
  const enrollIds = enrolls.map(e => e._id)

  // 5. Bookings del usuario (directo o vía subscriptions)
  const bookingsDirectos = await Booking.find({ studentId: userId }).lean<any[]>()
  const bookingsViaSub   = subIds.length > 0
    ? await Booking.find({ subscriptionId: { $in: subIds } }).lean<any[]>()
    : []
  const allBookingIds = Array.from(new Set([
    ...bookingsDirectos.map(b => String(b._id)),
    ...bookingsViaSub.map(b => String(b._id)),
  ])).map(id => new mongoose.Types.ObjectId(id))

  // 6. TODOS los Bookings del sistema (para limpiar huérfanos)
  const totalBookingsCount = await Booking.countDocuments({})

  // 7. PBs del usuario
  const pbCount = await PaymentBreakdown.countDocuments({
    $or: [
      { studentId: userId },
      { subscriptionId: { $in: subIds } },
      { enrollmentId: { $in: enrollIds } },
    ]
  })

  // 8. Reviews
  const reviewCount = await Review.countDocuments({ studentId: userId })

  // 9. ManualPaymentRecords
  const mprCount = await ManualPaymentRecord.countDocuments({ studentId: userId })

  // 10. CreditTransactions
  const ctCount = await CreditTransaction.countDocuments({ userId })

  // 11. FinanceAuditLog
  const falCount = await FinanceAuditLog.countDocuments({ userId })

  console.log('\n📊 RESUMEN:')
  console.log(`   Subscriptions del usuario:   ${subs.length}`)
  console.log(`   Enrollments del usuario:     ${enrolls.length}`)
  console.log(`   Bookings del usuario:        ${allBookingIds.length}`)
  console.log(`   ── TODOS los Bookings:       ${totalBookingsCount} (se borran TODOS — huérfanos incluidos)`)
  console.log(`   PaymentBreakdowns:           ${pbCount}`)
  console.log(`   Reviews:                     ${reviewCount}`)
  console.log(`   ManualPaymentRecords:        ${mprCount}`)
  console.log(`   CreditTransactions:          ${ctCount}`)
  console.log(`   FinanceAuditLogs:            ${falCount}`)
  console.log(`   Usuario:                     1`)

  if (DRY_RUN) {
    console.log('\n✅ Dry-run terminado.')
    process.exit(0)
  }

  // ── BORRADO EN CASCADA ────────────────────────────────────────────────────

  // Primero: TODOS los bookings (huérfanos incluidos)
  const r1 = await Booking.deleteMany({})
  console.log(`\n🗑️  TODOS los Bookings:        ${r1.deletedCount}`)

  const r2 = await PaymentBreakdown.deleteMany({
    $or: [
      { studentId: userId },
      { subscriptionId: { $in: subIds } },
      { enrollmentId: { $in: enrollIds } },
    ]
  })
  console.log(`   PaymentBreakdowns:           ${r2.deletedCount}`)

  const r3 = await Review.deleteMany({ studentId: userId })
  console.log(`   Reviews:                     ${r3.deletedCount}`)

  const r4 = await ManualPaymentRecord.deleteMany({ studentId: userId })
  console.log(`   ManualPaymentRecords:        ${r4.deletedCount}`)

  const r5 = await CreditTransaction.deleteMany({ userId })
  console.log(`   CreditTransactions:          ${r5.deletedCount}`)

  const r6 = await FinanceAuditLog.deleteMany({ userId })
  console.log(`   FinanceAuditLogs:            ${r6.deletedCount}`)

  const r7 = await Subscription.deleteMany({ _id: { $in: subIds } })
  console.log(`   Subscriptions:               ${r7.deletedCount}`)

  const r8 = await Enrollment.deleteMany({ _id: { $in: enrollIds } })
  console.log(`   Enrollments:                 ${r8.deletedCount}`)

  const r9 = await User.deleteOne({ _id: userId })
  console.log(`   Usuario eliminado:           ${r9.deletedCount}`)

  console.log('\n✅ Purga completada.')
  process.exit(0)
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })
