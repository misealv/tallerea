import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { LiquidationService } from '@/services/LiquidationService'
import { validateRequired, validateObjectId } from '@/lib/validate'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const page = Number(searchParams.get('page')) || 1
    const limit = Number(searchParams.get('limit')) || 20
    const ownerId = searchParams.get('ownerId')
    const estado = searchParams.get('estado')

    const filters: Record<string, unknown> = {}
    if (ownerId) filters.ownerId = ownerId
    if (estado) filters.estado = estado

    const result = await LiquidationService.getAll(filters, page, limit)
    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Generar liquidación — soporta ownerId (nuevo) o accountId (legacy)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    const body = await req.json()

    if (!body.ownerId) {
      return NextResponse.json({ error: 'Debe incluir ownerId' }, { status: 400 })
    }
    const missing = validateRequired(body, ['desde', 'hasta'])
    if (missing) return NextResponse.json({ error: missing }, { status: 400 })

    if (!validateObjectId(body.ownerId)) {
      return NextResponse.json({ error: 'ownerId inválido' }, { status: 400 })
    }

    const liquidation = await LiquidationService.generate(
      body.ownerId,
      new Date(body.desde),
      new Date(body.hasta),
      session.user.id
    )

    return NextResponse.json(liquidation, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
