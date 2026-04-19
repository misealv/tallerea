import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { BookingService } from '@/services/BookingService'
import { validateRequired, validateObjectId } from '@/lib/validate'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const page = Number(searchParams.get('page')) || 1
    const limit = Number(searchParams.get('limit')) || 20
    const workshopId = searchParams.get('workshopId')

    const filters: Record<string, unknown> = {}
    if (session.user.role !== 'admin') {
      filters.studentId = session.user.id
    }
    if (workshopId) filters.workshopId = workshopId

    const result = await BookingService.getAll(filters, page, limit)
    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await req.json()
    const missing = validateRequired(body, ['subscriptionId', 'workshopId', 'slotIndex'])
    if (missing) return NextResponse.json({ error: missing }, { status: 400 })

    if (!validateObjectId(body.subscriptionId) || !validateObjectId(body.workshopId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    if (!Number.isInteger(body.slotIndex) || body.slotIndex < 0) {
      return NextResponse.json({ error: 'slotIndex debe ser entero positivo' }, { status: 400 })
    }

    const booking = await BookingService.reserve(
      body.subscriptionId,
      body.workshopId,
      session.user.id,
      body.slotIndex
    )

    return NextResponse.json(booking, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
