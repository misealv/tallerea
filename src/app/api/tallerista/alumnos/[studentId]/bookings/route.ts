import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Booking from '@/models/Booking'
import Workshop from '@/models/Workshop'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

// GET /api/tallerista/alumnos/[studentId]/bookings
// Devuelve todas las reservas de un alumno en talleres del tallerista autenticado.
export async function GET(
  _req: NextRequest,
  { params }: { params: { studentId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { studentId } = params
  if (!Types.ObjectId.isValid(studentId)) {
    return NextResponse.json({ error: 'studentId inválido' }, { status: 400 })
  }

  await dbConnect()
  const ownerId = new Types.ObjectId(session.user.id)

  // Solo workshops del tallerista autenticado — garantía multi-tenant
  const workshopIds = await Workshop.distinct('_id', { ownerId, activo: true })

  const bookings = await Booking.find({
    studentId: new Types.ObjectId(studentId),
    workshopId: { $in: workshopIds },
    activo: true,
  })
    .populate('workshopId', 'titulo')
    .sort({ fecha: -1 })
    .lean()

  return NextResponse.json(bookings)
}
