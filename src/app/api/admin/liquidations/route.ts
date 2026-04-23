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
    const accountId = searchParams.get('accountId')
    const estado = searchParams.get('estado')

    const filters: Record<string, unknown> = {}
    if (ownerId) filters.ownerId = ownerId
    else if (accountId) filters.accountId = accountId
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

    if (!body.ownerId && !body.accountId) {
      return NextResponse.json({ error: 'Debe incluir ownerId o accountId' }, { status: 400 })
    }
    const missing = validateRequired(body, ['desde', 'hasta'])
    if (missing) return NextResponse.json({ error: missing }, { status: 400 })

    const subjectId = body.ownerId || body.accountId
    const mode = body.ownerId ? 'ownerId' : 'accountId'

    if (!validateObjectId(subjectId)) {
      return NextResponse.json({ error: `${mode} inválido` }, { status: 400 })
    }

    const liquidation = await LiquidationService.generate(
      subjectId,
      new Date(body.desde),
      new Date(body.hasta),
      session.user.id,
      mode
    )

    return NextResponse.json(liquidation, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
