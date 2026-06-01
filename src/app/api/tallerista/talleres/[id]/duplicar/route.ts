import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { WorkshopService } from '@/services/WorkshopService'
import { extractIdString } from '@/lib/auth'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Verificar que el taller pertenece al tallerista
  const source = await WorkshopService.getByIdIncludingInactive(params.id)
  if (!source) return NextResponse.json({ error: 'Taller no encontrado' }, { status: 404 })

  const ownerId = extractIdString(source.ownerId)
  if (ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const copia = await WorkshopService.duplicate(params.id, session.user.id)
    return NextResponse.json({ id: String(copia._id) }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
