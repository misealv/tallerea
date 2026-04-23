import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { TallerService } from '@/services/TallerService'
import { z } from 'zod'

const BodySchema = z.object({ razon: z.string().min(5).max(500) })

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const parsed = BodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Debe incluir una razón de suspensión' }, { status: 400 })
  }

  try {
    const user = await TallerService.suspender(params.id, session.user.id, parsed.data.razon)
    return NextResponse.json({ ok: true, estado: user.taller?.estado })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
