import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Subscription from '@/models/Subscription'
import Workshop from '@/models/Workshop'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

// GET /api/tallerista/subscriptions/[id]/slots
// Devuelve los slots futuros con cupo disponible del taller asociado a la suscripción.
// Usado por el modal de reserva del tallerista.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  await dbConnect()

  const sub = await Subscription.findOne({ _id: params.id, activo: true, estado: 'activa' })
    .select('workshopId studentId sesionesDisponibles')
    .lean<{ workshopId: Types.ObjectId; studentId: Types.ObjectId; sesionesDisponibles: number }>()

  if (!sub) return NextResponse.json({ error: 'Suscripción no encontrada o no activa' }, { status: 404 })

  // Ownership: solo el tallerista dueño del taller puede ver esto
  const workshop = await Workshop.findOne({
    _id: sub.workshopId,
    $or: [{ ownerId: session.user.id }, { accountId: session.user.id }],
  }).select('slots cupoPorSesion').lean<{
    slots: { _id: Types.ObjectId; fecha: Date; cancelado: boolean; reservas: number; descripcion?: string }[]
    cupoPorSesion: number
  }>()

  if (!workshop) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (sub.sesionesDisponibles <= 0) {
    return NextResponse.json({ error: 'El alumno no tiene sesiones disponibles' }, { status: 400 })
  }

  const now = new Date()

  // Slots futuros, no cancelados, con cupo
  const slotsDisponibles = workshop.slots
    .map((s, index) => ({ ...s, index }))
    .filter(s => !s.cancelado && s.fecha && new Date(s.fecha) > now && s.reservas < workshop.cupoPorSesion)
    .map(s => ({
      index:       s.index,
      fecha:       s.fecha,
      cupoLibre:   workshop.cupoPorSesion - s.reservas,
      descripcion: s.descripcion ?? null,
    }))
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
    .slice(0, 60) // máximo 60 slots hacia adelante

  return NextResponse.json({ slots: slotsDisponibles, sesionesDisponibles: sub.sesionesDisponibles })
}
