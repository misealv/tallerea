import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Workshop from '@/models/Workshop'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const role = session.user.role
  const tallerEstado = (session.user as { tallerEstado?: string }).tallerEstado
  if (role !== 'admin' && tallerEstado !== 'aprobado') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  await dbConnect()
  const workshop = await Workshop.findOne({ _id: id, activo: true })
    .select('titulo ownerId accountId modeloAcceso slots cupoDisponible precioFijo precio')
    .lean<{
      _id: unknown; titulo: string; ownerId?: unknown; accountId?: unknown
      modeloAcceso: string
      slots: { horaInicio: string; horaFin: string; fecha?: Date; cupoDisponible: number; cancelado?: boolean }[]
      cupoDisponible: number
      precioFijo?: { monto: number }
      precio?: number
    }>()

  if (!workshop) return NextResponse.json({ error: 'Taller no encontrado' }, { status: 404 })

  const ownerIdStr = String(workshop.ownerId ?? workshop.accountId ?? '')
  if (ownerIdStr !== session.user.id && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(workshop)
}
