import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { WorkshopFileService } from '@/services/WorkshopFileService'
import { validateObjectId } from '@/lib/validate'

export const dynamic = 'force-dynamic'

// GET /api/workshops/[id]/files/quota
// Devuelve cuota usada/máxima del tallerista owner del taller
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!validateObjectId(params.id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const tallerEstado = (session.user as { tallerEstado?: string }).tallerEstado
  if (session.user.role !== 'admin' && tallerEstado !== 'aprobado') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const cuota = await WorkshopFileService.cuotaUsada(session.user.id)
    return NextResponse.json(cuota)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
