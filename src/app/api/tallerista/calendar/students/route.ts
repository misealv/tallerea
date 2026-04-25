import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Workshop from '@/models/Workshop'
import Booking from '@/models/Booking'
import User from '@/models/User'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

interface BookingLean { studentId: Types.ObjectId; estado: string }
interface UserLean { _id: Types.ObjectId; name: string; email: string }

// GET /api/tallerista/calendar/students?workshopId=...&slotIndex=...
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const role = session.user.role
  const estado = (session.user as { tallerEstado?: string }).tallerEstado
  if (role !== 'admin' && estado !== 'aprobado') {
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

  // Verificar ownership del taller
  const workshop = await Workshop.findOne({ _id: workshopId, ownerId: session.user.id, activo: true }).select('_id').lean()
  if (!workshop) return NextResponse.json({ error: 'Taller no encontrado' }, { status: 404 })

  // Bookings activos para este slot
  const bookings = await Booking.find({
    workshopId,
    slotIndex,
    estado: { $nin: ['cancelada'] },
    activo: true,
  }).select('studentId estado').lean<BookingLean[]>()

  if (bookings.length === 0) return NextResponse.json({ data: [] })

  const studentIds = Array.from(new Set(bookings.map(b => String(b.studentId))))
  const users = await User.find({ _id: { $in: studentIds } })
    .select('name email')
    .lean<UserLean[]>()

  const userMap = new Map(users.map(u => [String(u._id), u]))
  const data = bookings.map(b => {
    const u = userMap.get(String(b.studentId))
    return { name: u?.name ?? 'Alumno', email: u?.email ?? '', estado: b.estado }
  })

  return NextResponse.json({ data })
}
