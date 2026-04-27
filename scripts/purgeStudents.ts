/**
 * purgeStudents.ts
 * Elimina en cascada todos los estudiantes (y datos derivados) asociados
 * a los talleres de un tallerista dado.
 *
 * USO:
 *   npx tsx scripts/purgeStudents.ts --dry-run   ← solo cuenta, no borra
 *   npx tsx scripts/purgeStudents.ts              ← borra de verdad
 *
 * ALCANCE DE LA PURGA (por workshopId de ese owner):
 *   Booking → Subscription → Enrollment → PaymentBreakdown →
 *   ManualPaymentRecord → CreditTransaction → Review →
 *   FinanceAuditLog → Liquidation (si todas las PB eran de este owner) →
 *   User de alumnos (solo los que NO tienen otro rol o talleres propios)
 */

import 'dotenv/config'
import mongoose from 'mongoose'

const OWNER_EMAIL = 'miseal@gmail.com'
const DRY_RUN = process.argv.includes('--dry-run')

// ── Esquemas mínimos inline (sin importar services) ──────────────────────────
const UserSchema = new mongoose.Schema({ email: String, role: String, taller: mongoose.Schema.Types.Mixed }, { strict: false })
const WorkshopSchema = new mongoose.Schema({ ownerId: mongoose.Schema.Types.ObjectId }, { strict: false })
const SubscriptionSchema = new mongoose.Schema({ workshopId: mongoose.Schema.Types.ObjectId, studentId: mongoose.Schema.Types.ObjectId }, { strict: false })
const EnrollmentSchema = new mongoose.Schema({ workshopId: mongoose.Schema.Types.ObjectId, studentId: mongoose.Schema.Types.ObjectId }, { strict: false })
const BookingSchema = new mongoose.Schema({ subscriptionId: mongoose.Schema.Types.ObjectId, studentId: mongoose.Schema.Types.ObjectId }, { strict: false })
const PBSchema = new mongoose.Schema({ workshopId: mongoose.Schema.Types.ObjectId, studentId: mongoose.Schema.Types.ObjectId, subscriptionId: mongoose.Schema.Types.ObjectId, enrollmentId: mongoose.Schema.Types.ObjectId }, { strict: false })
const ReviewSchema = new mongoose.Schema({ workshopId: mongoose.Schema.Types.ObjectId, studentId: mongoose.Schema.Types.ObjectId }, { strict: false })
const ManualPaymentSchema = new mongoose.Schema({ workshopId: mongoose.Schema.Types.ObjectId, studentId: mongoose.Schema.Types.ObjectId }, { strict: false })
const CreditTxSchema = new mongoose.Schema({ userId: mongoose.Schema.Types.ObjectId }, { strict: false })
const FALSchema = new mongoose.Schema({ userId: mongoose.Schema.Types.ObjectId }, { strict: false })
const LiquidationSchema = new mongoose.Schema({ ownerId: mongoose.Schema.Types.ObjectId }, { strict: false })

const User = mongoose.models.User || mongoose.model('User', UserSchema)
const Workshop = mongoose.models.Workshop || mongoose.model('Workshop', WorkshopSchema)
const Subscription = mongoose.models.Subscription || mongoose.model('Subscription', SubscriptionSchema)
const Enrollment = mongoose.models.Enrollment || mongoose.model('Enrollment', EnrollmentSchema)
const Booking = mongoose.models.Booking || mongoose.model('Booking', BookingSchema)
const PaymentBreakdown = mongoose.models.PaymentBreakdown || mongoose.model('PaymentBreakdown', PBSchema)
const Review = mongoose.models.Review || mongoose.model('Review', ReviewSchema)
const ManualPaymentRecord = mongoose.models.ManualPaymentRecord || mongoose.model('ManualPaymentRecord', ManualPaymentSchema)
const CreditTransaction = mongoose.models.CreditTransaction || mongoose.model('CreditTransaction', CreditTxSchema)
const FinanceAuditLog = mongoose.models.FinanceAuditLog || mongoose.model('FinanceAuditLog', FALSchema)
const Liquidation = mongoose.models.Liquidation || mongoose.model('Liquidation', LiquidationSchema)

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!)
  console.log('✅ Conectado a MongoDB')
  console.log(DRY_RUN ? '🔍 MODO DRY-RUN — no se borra nada\n' : '🔴 MODO REAL — borrando...\n')

  // 1. Owner
  const owner = await User.findOne({ email: OWNER_EMAIL }).lean<any>()
  if (!owner) throw new Error(`No se encontró el usuario ${OWNER_EMAIL}`)
  const ownerId = owner._id
  console.log(`👤 Owner: ${OWNER_EMAIL} → ${ownerId}`)

  // 2. Workshops del owner
  const workshops = await Workshop.find({ ownerId }).lean<any[]>()
  const workshopIds = workshops.map(w => w._id)
  console.log(`🎨 Talleres del owner: ${workshopIds.length}`)
  if (workshopIds.length === 0) { console.log('Sin talleres, nada que purgar.'); process.exit(0) }

  // 3. Subscriptions y Enrollments
  const subs = await Subscription.find({ workshopId: { $in: workshopIds } }).lean<any[]>()
  const subIds = subs.map(s => s._id)
  const studentIdsFromSubs = Array.from(new Set(subs.map(s => String(s.studentId))))

  const enrolls = await Enrollment.find({ workshopId: { $in: workshopIds } }).lean<any[]>()
  const enrollIds = enrolls.map(e => e._id)
  const studentIdsFromEnrolls = Array.from(new Set(enrolls.map(e => String(e.studentId))))

  const allStudentIdStrings = Array.from(new Set([...studentIdsFromSubs, ...studentIdsFromEnrolls]))
  const allStudentIds = allStudentIdStrings.map(id => new mongoose.Types.ObjectId(id))

  // 4. Bookings
  const bookingCount = await Booking.countDocuments({ subscriptionId: { $in: subIds } })

  // 5. PaymentBreakdowns
  const pbCount = await PaymentBreakdown.countDocuments({
    $or: [
      { workshopId: { $in: workshopIds } },
      { subscriptionId: { $in: subIds } },
      { enrollmentId: { $in: enrollIds } },
    ]
  })

  // 6. Reviews
  const reviewCount = await Review.countDocuments({ workshopId: { $in: workshopIds } })

  // 7. ManualPaymentRecords
  const mprCount = await ManualPaymentRecord.countDocuments({ workshopId: { $in: workshopIds } })

  // 8. CreditTransactions de alumnos
  const ctCount = await CreditTransaction.countDocuments({ userId: { $in: allStudentIds } })

  // 9. FinanceAuditLogs de alumnos
  const falCount = await FinanceAuditLog.countDocuments({ userId: { $in: allStudentIds } })

  // 10. Liquidaciones del owner
  const liqCount = await Liquidation.countDocuments({ ownerId })

  // 11. Usuarios alumnos que no son talleristas ni admin y no tienen taller propio
  const studentUsers = await User.find({
    _id: { $in: allStudentIds },
    role: { $ne: 'admin' },
    'taller': { $exists: false }
  }).lean<any[]>()
  const studentUsersToDelete = studentUsers.length
  const protectedStudents = allStudentIds.length - studentUsersToDelete

  console.log('\n📊 RESUMEN:')
  console.log(`   Subscriptions:         ${subs.length}`)
  console.log(`   Enrollments:           ${enrolls.length}`)
  console.log(`   Bookings:              ${bookingCount}`)
  console.log(`   PaymentBreakdowns:     ${pbCount}`)
  console.log(`   Reviews:               ${reviewCount}`)
  console.log(`   ManualPaymentRecords:  ${mprCount}`)
  console.log(`   CreditTransactions:    ${ctCount}`)
  console.log(`   FinanceAuditLogs:      ${falCount}`)
  console.log(`   Liquidaciones owner:   ${liqCount}`)
  console.log(`   Usuarios alumnos:      ${studentUsersToDelete} (${protectedStudents} protegidos — son talleristas/admin)`)
  console.log(`   TOTAL DOCUMENTOS:      ${subs.length + enrolls.length + bookingCount + pbCount + reviewCount + mprCount + ctCount + falCount + liqCount + studentUsersToDelete}`)

  if (DRY_RUN) {
    console.log('\n✅ Dry-run terminado. Ejecuta sin --dry-run para borrar.')
    process.exit(0)
  }

  // ── BORRADO EN CASCADA ────────────────────────────────────────────────────
  console.log('\n🗑️  Borrando...')

  const r1 = await Booking.deleteMany({ subscriptionId: { $in: subIds } })
  console.log(`   Bookings:              ${r1.deletedCount}`)

  const r2 = await PaymentBreakdown.deleteMany({
    $or: [
      { workshopId: { $in: workshopIds } },
      { subscriptionId: { $in: subIds } },
      { enrollmentId: { $in: enrollIds } },
    ]
  })
  console.log(`   PaymentBreakdowns:     ${r2.deletedCount}`)

  const r3 = await Review.deleteMany({ workshopId: { $in: workshopIds } })
  console.log(`   Reviews:               ${r3.deletedCount}`)

  const r4 = await ManualPaymentRecord.deleteMany({ workshopId: { $in: workshopIds } })
  console.log(`   ManualPaymentRecords:  ${r4.deletedCount}`)

  const r5 = await CreditTransaction.deleteMany({ userId: { $in: allStudentIds } })
  console.log(`   CreditTransactions:    ${r5.deletedCount}`)

  const r6 = await FinanceAuditLog.deleteMany({ userId: { $in: allStudentIds } })
  console.log(`   FinanceAuditLogs:      ${r6.deletedCount}`)

  const r7 = await Liquidation.deleteMany({ ownerId })
  console.log(`   Liquidaciones:         ${r7.deletedCount}`)

  const r8 = await Subscription.deleteMany({ workshopId: { $in: workshopIds } })
  console.log(`   Subscriptions:         ${r8.deletedCount}`)

  const r9 = await Enrollment.deleteMany({ workshopId: { $in: workshopIds } })
  console.log(`   Enrollments:           ${r9.deletedCount}`)

  const r10 = await User.deleteMany({
    _id: { $in: allStudentIds },
    role: { $ne: 'admin' },
    'taller': { $exists: false }
  })
  console.log(`   Usuarios alumnos:      ${r10.deletedCount}`)

  console.log('\n✅ Purga completada. Los talleres y el owner NO fueron modificados.')
  process.exit(0)
}

main().catch(err => { console.error('❌', err); process.exit(1) })
