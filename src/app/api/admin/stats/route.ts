import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import User from '@/models/User'
import Account from '@/models/Account'
import Workshop from '@/models/Workshop'
import Enrollment from '@/models/Enrollment'

export const dynamic = 'force-dynamic'

// GET /api/admin/stats — KPIs de la plataforma
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  await dbConnect()

  const [users, accounts, workshops, enrollments, revenue] = await Promise.all([
    User.countDocuments(),
    Account.countDocuments({ activo: true }),
    Workshop.countDocuments({ activo: true }),
    Enrollment.countDocuments({ activo: true }),
    Enrollment.aggregate([
      { $match: { estado: 'pagado', activo: true } },
      { $group: { _id: null, total: { $sum: '$monto' } } },
    ]),
  ])

  return NextResponse.json({
    users, accounts, workshops, enrollments,
    revenue: revenue[0]?.total || 0,
  })
}
