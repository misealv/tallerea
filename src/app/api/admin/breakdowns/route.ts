import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import PaymentBreakdown from '@/models/PaymentBreakdown'
import Liquidation from '@/models/Liquidation'

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
    // [FINANCE] Por defecto ocultamos breakdowns huérfanos (pendientes sin mercadoPagoId).
    // Son artefactos del flujo de Subscription que crea breakdown antes de confirmar pago.
    // Pasar ?incluirHuerfanos=true para auditarlos desde admin.
    const incluirHuerfanos = searchParams.get('incluirHuerfanos') === 'true'

    const query: Record<string, unknown> = {}
    if (ownerId) query.ownerId = ownerId
    else if (accountId) query.accountId = accountId
    if (tipo) query.tipo = tipo
    if (!incluirHuerfanos) {
      // Excluir solo: tipo 'pago' + estado 'pendiente' + sin mercadoPagoId
      query.$nor = [{
        tipo: 'pago',
        estado: 'pendiente',
        $or: [{ mercadoPagoId: { $exists: false } }, { mercadoPagoId: null }, { mercadoPagoId: '' }],
      }]
    }

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

    // [INMUTABLE] Los breakdowns post-fix nunca reciben estado:'liquidado'.
    // Enriquecer la respuesta con isLiquidated consultando Liquidation.breakdowns[].
    const breakdownIds = data.map((b) => b._id)
    const liquidacionesConEstos = await Liquidation.find({
      breakdowns: { $in: breakdownIds },
    }).select('breakdowns').lean<{ breakdowns: unknown[] }[]>()
    const liquidadosSet = new Set<string>(
      liquidacionesConEstos.flatMap((l) => (l.breakdowns as unknown[]).map(String))
    )
    const enriched = data.map((b) => ({
      ...b,
      isLiquidated: (b as { estado?: string }).estado === 'liquidado' || liquidadosSet.has(String(b._id)),
    }))

    return NextResponse.json({ data: enriched, total, page, limit })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
