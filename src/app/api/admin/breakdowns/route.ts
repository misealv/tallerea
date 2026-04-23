import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import PaymentBreakdown from '@/models/PaymentBreakdown'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    await dbConnect()

    const { searchParams } = new URL(req.url)
    const page = Number(searchParams.get('page')) || 1
    const limit = Number(searchParams.get('limit')) || 20
    const ownerId = searchParams.get('ownerId')
    const accountId = searchParams.get('accountId')
    const tipo = searchParams.get('tipo')

    const query: Record<string, unknown> = {}
    if (ownerId) query.ownerId = ownerId
    else if (accountId) query.accountId = accountId
    if (tipo) query.tipo = tipo

    const [data, total] = await Promise.all([
      PaymentBreakdown.find(query)
        .populate('workshopId', 'titulo slug')
        .populate('studentId', 'name email')
        .populate('ownerId', 'name email')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),
      PaymentBreakdown.countDocuments(query),
    ])

    return NextResponse.json({ data, total, page, limit })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
