import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ReviewService } from '@/services/ReviewService'
import { ReviewCreateSchema } from '@/schemas/review'

// GET /api/reviews?workshopId=xxx[&page=1&limit=20]
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workshopId = searchParams.get('workshopId')
  if (!workshopId) {
    return NextResponse.json({ error: 'workshopId requerido' }, { status: 400 })
  }
  const page  = Number(searchParams.get('page'))  || 1
  const limit = Number(searchParams.get('limit')) || 20
  try {
    const result = await ReviewService.getByWorkshop(workshopId, page, limit)
    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/reviews — solo alumnos autenticados
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const parsed = ReviewCreateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const review = await ReviewService.create(session.user.id, parsed.data)
    return NextResponse.json(review, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status  = message.includes('requisitos') ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
