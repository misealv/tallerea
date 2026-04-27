import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { UserService } from '@/services/UserService'
import { z } from 'zod'

const DependentCreateSchema = z.object({
  nombre: z.string().min(1).max(100),
  fechaNacimiento: z.string().datetime({ offset: true }).optional().nullable(),
  notas: z.string().max(500).optional().nullable(),
})

// GET /api/users/me/dependents — lista dependientes activos
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const dependents = await UserService.listDependents(session.user.id)
    return NextResponse.json(dependents)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/users/me/dependents — agrega un dependiente
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parsed = DependentCreateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const { nombre, fechaNacimiento, notas } = parsed.data
    const dep = await UserService.addDependent(session.user.id, {
      nombre,
      fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : undefined,
      notas: notas ?? undefined,
    })
    return NextResponse.json(dep, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
