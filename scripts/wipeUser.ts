/* eslint-disable @typescript-eslint/no-explicit-any */
import { config } from 'dotenv'
config({ path: '.env.local' })
import mongoose from 'mongoose'
import User from '../src/models/User'
import Workshop from '../src/models/Workshop'
import Enrollment from '../src/models/Enrollment'
import Subscription from '../src/models/Subscription'
import Booking from '../src/models/Booking'
import Review from '../src/models/Review'
import PaymentBreakdown from '../src/models/PaymentBreakdown'
import Liquidation from '../src/models/Liquidation'
import CreditTransaction from '../src/models/CreditTransaction'
import FinanceAuditLog from '../src/models/FinanceAuditLog'

const EMAIL = process.argv.find(a => a.startsWith('--email='))?.split('=')[1] || 'miseal@gmail.com'
const APPLY = process.argv.includes('--apply')
const FORCE = process.argv.includes('--force')

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string)

  const user = await User.findOne({ email: EMAIL }).lean<any>()
  if (!user) {
    console.log(`❌ Usuario ${EMAIL} no encontrado`)
    await mongoose.disconnect()
    return
  }
  const uid = user._id

  console.log('\n=== USUARIO ===')
  console.log({ _id: uid, email: user.email, name: user.name, role: user.role })

  const workshops = await Workshop.find({ ownerId: uid }).lean<any[]>()
  const wids = workshops.map(w => w._id)
  console.log(`\n=== TALLERES owned (${workshops.length}) ===`)
  workshops.forEach(w => console.log(`  - ${w._id} | ${w.titulo} | ${w.slug} | activo=${w.activo}`))

  const counts = {
    enrollmentsAsStudent:   await Enrollment.countDocuments({ studentId: uid }),
    enrollmentsInWorkshops: await Enrollment.countDocuments({ workshopId: { $in: wids } }),
    subsAsStudent:          await Subscription.countDocuments({ studentId: uid }),
    subsInWorkshops:        await Subscription.countDocuments({ workshopId: { $in: wids } }),
    bookingsAsStudent:      await Booking.countDocuments({ studentId: uid }),
    bookingsInWorkshops:    await Booking.countDocuments({ workshopId: { $in: wids } }),
    reviewsGiven:           await Review.countDocuments({ studentId: uid }),
    reviewsReceived:        await Review.countDocuments({ ownerId: uid }),
    breakdowns:             await PaymentBreakdown.countDocuments({
      $or: [{ ownerId: uid }, { studentId: uid }, { workshopId: { $in: wids } }],
    }),
    liquidations:           await Liquidation.countDocuments({ ownerId: uid }),
    creditTx:               await CreditTransaction.countDocuments({ userId: uid }),
    auditLogs:              await FinanceAuditLog.countDocuments({ userId: uid }),
  }
  console.log('\n=== CONTEOS ===')
  console.log(counts)

  if (!APPLY) {
    console.log('\n⚠️  DRY-RUN. Para borrar: npx tsx scripts/wipeUser.ts --apply')
    await mongoose.disconnect()
    return
  }

  // [SAFETY] Bloquear borrado si hay PaymentBreakdown confirmados (pago real de MP)
  const paidEnrollIds = await Enrollment.find({
    studentId: uid,
    estado: 'pagado',
  }).distinct('_id')
  const confirmedPayments = paidEnrollIds.length > 0
    ? await PaymentBreakdown.countDocuments({
        $or: [
          { studentId: uid, estado: 'cobrado' },
          { studentId: uid, mercadoPagoId: { $exists: true, $ne: null } },
        ],
      })
    : 0
  if (confirmedPayments > 0 && !FORCE) {
    console.log(`\n🚨 BLOQUEADO: el usuario tiene ${confirmedPayments} PaymentBreakdown(s) confirmado(s) y ${paidEnrollIds.length} enrollment(s) pagado(s).`)
    console.log('   Esto borraría datos financieros reales (pagos de MercadoPago).')
    console.log('   Si realmente quieres continuar, agrega la flag --force.')
    await mongoose.disconnect()
    return
  }

  console.log('\n🔥 BORRANDO...')
  const r1 = await Booking.deleteMany({ $or: [{ studentId: uid }, { workshopId: { $in: wids } }] })
  console.log(`  bookings: ${r1.deletedCount}`)
  const r2 = await Subscription.deleteMany({ $or: [{ studentId: uid }, { workshopId: { $in: wids } }] })
  console.log(`  subscriptions: ${r2.deletedCount}`)
  const r3 = await Enrollment.deleteMany({ $or: [{ studentId: uid }, { workshopId: { $in: wids } }] })
  console.log(`  enrollments: ${r3.deletedCount}`)
  const r4 = await Review.deleteMany({ $or: [{ studentId: uid }, { ownerId: uid }] })
  console.log(`  reviews: ${r4.deletedCount}`)
  // [INMUTABLE] PaymentBreakdown y Liquidation NO se borran — son append-only financieros
  // Pero como es entorno de prueba y el usuario pidió borrar TODO, las eliminamos explícitamente
  const r5 = await PaymentBreakdown.deleteMany({
    $or: [{ ownerId: uid }, { studentId: uid }, { workshopId: { $in: wids } }],
  })
  console.log(`  paymentBreakdowns [INMUTABLE]: ${r5.deletedCount}`)
  const r6 = await Liquidation.deleteMany({ ownerId: uid })
  console.log(`  liquidations: ${r6.deletedCount}`)
  const r7 = await CreditTransaction.deleteMany({ userId: uid })
  console.log(`  creditTransactions: ${r7.deletedCount}`)
  const r8 = await FinanceAuditLog.deleteMany({ userId: uid })
  console.log(`  financeAuditLogs: ${r8.deletedCount}`)
  const r9 = await Workshop.deleteMany({ ownerId: uid })
  console.log(`  workshops: ${r9.deletedCount}`)
  const r10 = await User.deleteOne({ _id: uid })
  console.log(`  user: ${r10.deletedCount}`)

  console.log('\n✅ Borrado completo')
  await mongoose.disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
