import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { TallerService } from '@/services/TallerService'
import { z } from 'zod'

const PerfilUpdateSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres').max(100),
  bio: z.string().min(20, 'Mínimo 20 caracteres').max(2000),
  credenciales: z.string().min(10, 'Mínimo 10 caracteres').max(2000),
  especialidades: z.array(z.string()).min(1, 'Selecciona al menos una').max(5),
  entregaMateriales: z.string().max(500),
  logo: z.string().url().optional().or(z.literal('')),
  redesSociales: z.object({
    instagram: z.string().url().optional().or(z.literal('')),
    web: z.string().url().optional().or(z.literal('')),
    facebook: z.string().url().optional().or(z.literal('')),
  }).optional(),
}).strict()

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (session.user.tallerEstado !== 'aprobado') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const user = await TallerService.getById(session.user.id)
  if (!user) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json(user)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (session.user.tallerEstado !== 'aprobado') {
    return NextResponse.json({ error: 'Solo talleristas aprobados pueden editar su perfil' }, { status: 403 })
  }

  const parsed = PerfilUpdateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const updated = await TallerService.actualizarPerfil(session.user.id, parsed.data)
    return NextResponse.json({ ok: true, taller: updated.taller })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
