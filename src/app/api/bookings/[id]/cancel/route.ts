import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { BookingService } from '@/services/BookingService'
import { validateObjectId } from '@/lib/validate'

// PATCH /api/bookings/[id]/cancel — cancela una reserva del alumno autenticado
export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!validateObjectId(params.id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  try {
    // Verificar que la booking pertenece al alumno autenticado
    const booking = await BookingService.getById(params.id)
    if (!booking) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })

    const ownerId = (booking.studentId as unknown as { _id: { toString(): string } } | string)
    const ownerStr = typeof ownerId === 'string' ? ownerId : ownerId._id?.toString()
    if (ownerStr !== session.user.id && session.user.role !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const updated = await BookingService.cancel(params.id)
    return NextResponse.json(updated)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
