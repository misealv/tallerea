import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import User from '@/models/User'
import Workshop from '@/models/Workshop'
import Enrollment from '@/models/Enrollment'
import PaymentBreakdown from '@/models/PaymentBreakdown'
import Subscription from '@/models/Subscription'

export const dynamic = 'force-dynamic'

// GET /api/admin/stats — KPIs de la plataforma + adopción de auto-pago
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  await dbConnect()

  const [
    users, talleristas, workshops, enrollments, revenue, feeTotal,
    subsActivas, subsAutopago, subsAutopagoAuthorized,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ 'taller.estado': 'aprobado' }),
    Workshop.countDocuments({ activo: true }),
    Enrollment.countDocuments({ activo: true }),
    Enrollment.aggregate([
      { $match: { estado: 'pagado', activo: true } },
      { $group: { _id: null, total: { $sum: '$monto' } } },
    ]),
    PaymentBreakdown.aggregate([
      { $match: { tipo: 'pago' } },
      { $group: { _id: null, fee: { $sum: '$feeTallerea' } } },
    ]),
    // [INCENTIVOS] Métricas de adopción del pago automático
    Subscription.countDocuments({ estado: 'activa', activo: true }),
    Subscription.countDocuments({ estado: 'activa', activo: true, pagoAutomatico: true }),
    Subscription.countDocuments({ estado: 'activa', activo: true, pagoAutomatico: true, mpPreapprovalStatus: 'authorized' }),
  ])

  const adopcionPct = subsActivas > 0
    ? Math.round((subsAutopagoAuthorized / subsActivas) * 100)
    : 0

  return NextResponse.json({
    users, talleristas, workshops, enrollments,
    revenue: revenue[0]?.total || 0,
    feeTallerea: feeTotal[0]?.fee || 0,
    // Adopción de pago automático
    autopago: {
      subsActivas,
      subsConMandato: subsAutopago,
      subsConMandatoActivo: subsAutopagoAuthorized,
      adopcionPct,
    },
  })
}

