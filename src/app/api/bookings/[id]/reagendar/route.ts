import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Booking from '@/models/Booking'
import Workshop from '@/models/Workshop'
import { BookingService } from '@/services/BookingService'

// POST: alumno solicita reagendamiento
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { slotDestinoIndex } = await req.json()
  if (!Number.isInteger(slotDestinoIndex) || slotDestinoIndex < 0) {
    return NextResponse.json({ error: 'slotDestinoIndex inválido' }, { status: 400 })
  }

  try {
    await dbConnect()
    const booking = await Booking.findOne({ _id: params.id, activo: true })
    if (!booking) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (String(booking.studentId) !== session.user.id) {
      return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
    }
    if (booking.estado !== 'reservada') {
      return NextResponse.json({ error: 'Solo se pueden reagendar reservas activas' }, { status: 400 })
    }
    if (booking.reagendamiento?.estado === 'pendiente') {
      return NextResponse.json({ error: 'Ya existe una solicitud pendiente' }, { status: 409 })
    }

    booking.reagendamiento = {
      solicitadoEn: new Date(),
      estado: 'pendiente',
      slotDestinoIndex,
    }
    await booking.save()
    return NextResponse.json(booking)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

// PATCH: tallerista aprueba o rechaza
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.user.tallerEstado !== 'aprobado' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Solo talleristas pueden decidir' }, { status: 403 })
  }

  const { decision, razonRechazo } = await req.json() as { decision: 'aprobado' | 'rechazado'; razonRechazo?: string }
  if (!['aprobado', 'rechazado'].includes(decision)) {
    return NextResponse.json({ error: 'decision debe ser aprobado o rechazado' }, { status: 400 })
  }

  try {
    await dbConnect()
    const booking = await Booking.findOne({ _id: params.id, activo: true })
    if (!booking) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (!booking.reagendamiento || booking.reagendamiento.estado !== 'pendiente') {
      return NextResponse.json({ error: 'Sin solicitud pendiente' }, { status: 409 })
    }

    // Verificar ownership del taller
    const workshop = await Workshop.findById(booking.workshopId).select('ownerId accountId').lean<{ ownerId?: unknown; accountId?: unknown }>()
    const ownerId = String(workshop?.ownerId ?? workshop?.accountId ?? '')
    if (session.user.role !== 'admin' && ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
    }

    booking.reagendamiento.estado = decision
    booking.reagendamiento.decididoEn = new Date()
    if (decision === 'rechazado' && razonRechazo) booking.reagendamiento.razonRechazo = razonRechazo

    // Si aprobado: ejecutar el cambio de slot
    if (decision === 'aprobado' && booking.reagendamiento.slotDestinoIndex !== undefined) {
      await booking.save()
      const updated = await BookingService.changeSlot(params.id, booking.reagendamiento.slotDestinoIndex)
      return NextResponse.json(updated)
    }

    await booking.save()
    return NextResponse.json(booking)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
