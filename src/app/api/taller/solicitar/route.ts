import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { TallerService } from '@/services/TallerService'
import { z } from 'zod'

const SolicitarSchema = z.object({
  slug: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/, 'Solo letras, números y guiones'),
  bio: z.string().min(20).max(2000),
  credenciales: z.string().min(10).max(2000),
  especialidades: z.array(z.string()).min(1).max(5),
  entregaMateriales: z.string().max(500),
  redesSociales: z.object({
    instagram: z.string().url().optional().or(z.literal('')),
    web: z.string().url().optional().or(z.literal('')),
  }).optional(),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const parsed = SolicitarSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const user = await TallerService.solicitar(session.user.id, parsed.data)
    return NextResponse.json({ ok: true, estado: user.taller?.estado })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
