import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ReviewService } from '@/services/ReviewService'
import { z } from 'zod'

const ModerarSchema = z.object({ publicado: z.boolean() }).strict()

// PATCH /api/admin/reviews/[id]/moderar — solo admin
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const parsed = ModerarSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const review = await ReviewService.moderar(params.id, parsed.data.publicado)
    if (!review) return NextResponse.json({ error: 'Review no encontrado' }, { status: 404 })
    return NextResponse.json(review)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
