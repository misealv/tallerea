import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { WorkshopFileService } from '@/services/WorkshopFileService'
import { WorkshopService } from '@/services/WorkshopService'
import { validateObjectId } from '@/lib/validate'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

async function requireOwner(workshopId: string, userId: string, role: string) {
  const w = await WorkshopService.getByIdIncludingInactive(workshopId)
  if (!w) return null
  if (role !== 'admin' && String(w.ownerId) !== userId) return null
  return w
}

// PATCH /api/workshops/[id]/files/[fileId]
// Renombrar, mover, cambiar visibilidad
const UpdateSchema = z.object({
  nombre:          z.string().min(1).max(200).optional(),
  parentFolderId:  z.string().nullable().optional(),
  visibilidad:     z.enum(['tallerista', 'alumnos']).optional(),
}).strict()

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!validateObjectId(params.id) || !validateObjectId(params.fileId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const w = await requireOwner(params.id, session.user.id, session.user.role)
  if (!w) return NextResponse.json({ error: 'Taller no encontrado o sin acceso' }, { status: 403 })

  const parsed = UpdateSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Validación', details: parsed.error.flatten() }, { status: 400 })
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Sin campos a actualizar' }, { status: 400 })
  }

  try {
    const updated = await WorkshopFileService.actualizar(
      params.fileId,
      String(w.ownerId),
      parsed.data,
    )
    return NextResponse.json(updated)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status = message.includes('no encontrado') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

// DELETE /api/workshops/[id]/files/[fileId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!validateObjectId(params.id) || !validateObjectId(params.fileId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const w = await requireOwner(params.id, session.user.id, session.user.role)
  if (!w) return NextResponse.json({ error: 'Taller no encontrado o sin acceso' }, { status: 403 })

  try {
    await WorkshopFileService.eliminar(params.fileId, String(w.ownerId))
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status = message.includes('no encontrado') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
