import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import PaymentBreakdown from '@/models/PaymentBreakdown'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  await dbConnect()

  // Agrega por ownerId (tallerista directo — flujo nuevo)
  const byOwner = await PaymentBreakdown.aggregate([
    { $match: { tipo: { $in: ['pago', 'ajuste'] } } },
    {
      $group: {
        _id: '$ownerId',
        totalBruto: { $sum: '$montoBruto' },
        totalFee: { $sum: '$feeTallerea' },
        totalProfesor: { $sum: '$montoProfesor' },
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        ownerId: '$_id',
        ownerName: { $ifNull: ['$user.name', 'Sin nombre'] },
        totalBruto: 1,
        totalFee: 1,
        totalProfesor: 1,
        count: 1,
      },
    },
    { $sort: { totalBruto: -1 } },
  ])

  const owners = byOwner

  const totals = owners.reduce(
    (acc, row) => ({
      bruto: acc.bruto + row.totalBruto,
      fee: acc.fee + row.totalFee,
      profesor: acc.profesor + row.totalProfesor,
      count: acc.count + row.count,
    }),
    { bruto: 0, fee: 0, profesor: 0, count: 0 }
  )

  return NextResponse.json({ owners, totals })
}

