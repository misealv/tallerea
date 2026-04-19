import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { LiquidationService } from '@/services/LiquidationService'

// POST /api/admin/liquidations/csv — Generar CSV bancario
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    if (!Array.isArray(body.liquidationIds) || body.liquidationIds.length === 0) {
      return NextResponse.json({ error: 'Se requiere array de liquidationIds' }, { status: 400 })
    }

    const csv = await LiquidationService.generateCsv(body.liquidationIds)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="liquidaciones_${Date.now()}.csv"`,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
