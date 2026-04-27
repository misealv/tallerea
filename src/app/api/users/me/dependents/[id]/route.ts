import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { UserService } from '@/services/UserService'
import { z } from 'zod'

const DependentUpdateSchema = z.object({
  nombre: z.string().min(1).max(100).optional(),
  fechaNacimiento: z.string().datetime({ offset: true }).nullable().optional(),
  notas: z.string().max(500).nullable().optional(),
}).strict()

// PUT /api/users/me/dependents/[id] — actualiza nombre/fechaNacimiento/notas
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parsed = DependentUpdateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación', details: parsed.error.flatten() }, { status: 400 })
  }

  // Verificar ownership del dependiente
  const owns = await UserService.ownsDependent(session.user.id, params.id)
  if (!owns) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  try {
    const { nombre, fechaNacimiento, notas } = parsed.data
    const updated = await UserService.updateDependent(session.user.id, params.id, {
      nombre,
      fechaNacimiento: fechaNacimiento !== undefined
        ? (fechaNacimiento ? new Date(fechaNacimiento) : null)
        : undefined,
      notas: notas !== undefined ? notas : undefined,
    })
    return NextResponse.json(updated)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

// DELETE /api/users/me/dependents/[id] — soft delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const owns = await UserService.ownsDependent(session.user.id, params.id)
  if (!owns) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  try {
    await UserService.removeDependent(session.user.id, params.id)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
