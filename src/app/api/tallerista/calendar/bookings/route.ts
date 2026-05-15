import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Workshop from '@/models/Workshop'
import Subscription from '@/models/Subscription'
import { BookingService } from '@/services/BookingService'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

// GET ?workshopId=&slotIndex=
// Devuelve suscripciones activas del taller sin reserva en ese slot (candidatos a reservar)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const estado = (session.user as { tallerEstado?: string }).tallerEstado
  if (session.user.role !== 'admin' && estado !== 'aprobado') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const workshopId = searchParams.get('workshopId')
  const slotIndexStr = searchParams.get('slotIndex')
  if (!workshopId || slotIndexStr === null) {
    return NextResponse.json({ error: 'Faltan parámetros: workshopId, slotIndex' }, { status: 400 })
  }
  const slotIndex = Number(slotIndexStr)
  if (!Number.isInteger(slotIndex) || slotIndex < 0) {
    return NextResponse.json({ error: 'slotIndex inválido' }, { status: 400 })
  }

  await dbConnect()

  // Verificar ownership
  const workshop = await Workshop.findOne({
    _id: workshopId,
    $or: [{ ownerId: session.user.id }, { accountId: session.user.id }],
    activo: true,
  }).select('_id').lean()
  if (!workshop) return NextResponse.json({ error: 'Taller no encontrado' }, { status: 404 })

  // Suscripciones activas del taller
  interface SubLean {
    _id: Types.ObjectId
    studentId: { _id: Types.ObjectId; name: string; email: string }
    sesionesDisponibles: number
    dependentNombreSnapshot?: string
    dependentId?: Types.ObjectId
  }
  const subs = await Subscription.find({ workshopId, estado: 'activa', activo: true })
    .populate('studentId', '_id name email')
    .select('_id studentId sesionesDisponibles dependentNombreSnapshot dependentId')
    .lean<SubLean[]>()

  // Filtrar las que ya tienen reserva en este slot
  const { default: Booking } = await import('@/models/Booking')
  const existingBookings = await Booking.find({
    workshopId,
    slotIndex,
    estado: { $ne: 'cancelada' },
    activo: true,
  }).select('studentId dependentId').lean<{ studentId: Types.ObjectId; dependentId?: Types.ObjectId }[]>()

  const reservedKeys = new Set(existingBookings.map(b =>
    `${String(b.studentId)}:${String(b.dependentId ?? '')}`
  ))

  const candidatos = subs
    .filter(s => {
      const key = `${String(s.studentId._id)}:${String(s.dependentId ?? '')}`
      return s.sesionesDisponibles > 0 && !reservedKeys.has(key)
    })
    .map(s => ({
      subscriptionId: String(s._id),
      studentId: String(s.studentId._id),
      name: s.dependentNombreSnapshot ?? s.studentId.name,
      email: s.studentId.email,
      sesionesDisponibles: s.sesionesDisponibles,
      esDependent: !!s.dependentNombreSnapshot,
    }))

  return NextResponse.json({ data: candidatos })
}

// POST { workshopId, slotIndex, subscriptionId }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const estado = (session.user as { tallerEstado?: string }).tallerEstado
  if (session.user.role !== 'admin' && estado !== 'aprobado') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { subscriptionId, slotIndex } = body
    if (!subscriptionId || slotIndex === undefined) {
      return NextResponse.json({ error: 'Faltan: subscriptionId, slotIndex' }, { status: 400 })
    }
    if (!Number.isInteger(slotIndex) || slotIndex < 0) {
      return NextResponse.json({ error: 'slotIndex inválido' }, { status: 400 })
    }

    const booking = await BookingService.reserveByTallerista(
      session.user.id,
      subscriptionId,
      slotIndex,
    )
    return NextResponse.json(booking, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
