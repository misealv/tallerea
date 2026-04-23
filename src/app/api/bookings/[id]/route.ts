import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { BookingService } from '@/services/BookingService'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const booking = await BookingService.getById(params.id)
    if (!booking) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    if (session.user.role !== 'admin' && String(booking.studentId) !== session.user.id) {
      return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
    }

    return NextResponse.json(booking)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Cancelar booking
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const booking = await BookingService.getById(params.id)
    if (!booking) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    if (session.user.role !== 'admin' && String(booking.studentId) !== session.user.id) {
      return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
    }

    const cancelled = await BookingService.cancel(params.id)
    return NextResponse.json(cancelled)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

// Cambiar slot o marcar asistencia
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await req.json()

    // Marcar asistencia: admin o tallerista dueño del taller
    if (body.estado && ['asistio', 'no_asistio'].includes(body.estado)) {
      const isAdmin = session.user.role === 'admin'
      const isTallerista = session.user.tallerEstado === 'aprobado'
      if (!isAdmin && !isTallerista) {
        return NextResponse.json({ error: 'Solo el tallerista puede marcar asistencia' }, { status: 403 })
      }
      // Si es tallerista, verificar que el booking pertenece a uno de sus talleres
      if (isTallerista && !isAdmin) {
        const booking = await BookingService.getById(params.id)
        if (!booking) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
        const Workshop = (await import('@/models/Workshop')).default
        const workshop = await Workshop.findById(booking.workshopId).select('ownerId accountId').lean<{ ownerId?: unknown; accountId?: unknown }>()
        const ownerId = String(workshop?.ownerId ?? workshop?.accountId ?? '')
        if (ownerId !== session.user.id) {
          return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
        }
      }
      const updated = await BookingService.markAttendance(params.id, body.estado)
      return NextResponse.json(updated)
    }

    // Cambiar slot (alumno o admin)
    if (body.newSlotIndex !== undefined) {
      if (!Number.isInteger(body.newSlotIndex) || body.newSlotIndex < 0) {
        return NextResponse.json({ error: 'newSlotIndex inválido' }, { status: 400 })
      }
      const updated = await BookingService.changeSlot(params.id, body.newSlotIndex)
      return NextResponse.json(updated)
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status = message.includes('vencido') ? 409 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
