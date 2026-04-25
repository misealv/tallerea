import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Workshop from '@/models/Workshop'
import Booking from '@/models/Booking'
import Enrollment from '@/models/Enrollment'
import User from '@/models/User'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

interface BookingLean { _id: Types.ObjectId; studentId: Types.ObjectId; estado: string }
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

  // Bookings activos para este slot (suscripciones recurrentes)
  const bookings = await Booking.find({
    workshopId,
    slotIndex,
    estado: { $nin: ['cancelada'] },
    activo: true,
  }).select('_id studentId estado').lean<BookingLean[]>()

  // [FIX] Enrollments puntuales y clasePrueba para este slot
  interface EnrollmentLean { _id: Types.ObjectId; studentId: Types.ObjectId; estado: string; esClasePrueba?: boolean }
  const enrollments = await Enrollment.find({
    workshopId,
    slotIndex,
    estado: { $nin: ['cancelado'] },
    activo: true,
  }).select('_id studentId estado esClasePrueba').lean<EnrollmentLean[]>()

  const totalRegistros = bookings.length + enrollments.length
  if (totalRegistros === 0) return NextResponse.json({ data: [] })

  const bookingStudentIds = bookings.map(b => String(b.studentId))
  const enrollmentStudentIds = enrollments.map(e => String(e.studentId))
  const allStudentIds = Array.from(new Set([...bookingStudentIds, ...enrollmentStudentIds]))

  const users = await User.find({ _id: { $in: allStudentIds } })
    .select('name email')
    .lean<UserLean[]>()

  const userMap = new Map(users.map(u => [String(u._id), u]))

  const bookingRows = bookings.map(b => {
    const u = userMap.get(String(b.studentId))
    return { bookingId: String(b._id), name: u?.name ?? 'Alumno', email: u?.email ?? '', estado: b.estado }
  })

  // Enrollments se presentan con prefijo 'e:' en bookingId para distinguirlos en el frontend
  const enrollmentRows = enrollments.map(e => {
    const u = userMap.get(String(e.studentId))
    const label = e.esClasePrueba ? `${e.estado} (prueba)` : e.estado
    return { bookingId: `e:${String(e._id)}`, name: u?.name ?? 'Alumno', email: u?.email ?? '', estado: label }
  })

  return NextResponse.json({ data: [...bookingRows, ...enrollmentRows] })
}

// PATCH /api/tallerista/calendar/students — cancelar reserva de un alumno
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const role = session.user.role
  const estado = (session.user as { tallerEstado?: string }).tallerEstado
  if (role !== 'admin' && estado !== 'aprobado') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { bookingId?: string; workshopId?: string; slotIndex?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }

  const { bookingId, workshopId, slotIndex } = body
  if (!bookingId || !workshopId || typeof slotIndex !== 'number') {
    return NextResponse.json({ error: 'Faltan campos: bookingId, workshopId, slotIndex' }, { status: 400 })
  }

  await dbConnect()

  // Verificar ownership del taller
  const workshop = await Workshop.findOne({ _id: workshopId, ownerId: session.user.id, activo: true })
  if (!workshop) return NextResponse.json({ error: 'Taller no encontrado' }, { status: 404 })

  // Cancelar el booking
  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, workshopId, slotIndex, estado: { $ne: 'cancelada' } },
    { estado: 'cancelada', canceladaEn: new Date(), canceladaRazon: 'tallerista' },
    { new: true }
  )
  if (!booking) return NextResponse.json({ error: 'Reserva no encontrada o ya cancelada' }, { status: 404 })

  // Incrementar cupo disponible del slot (caché)
  if (slotIndex >= 0 && slotIndex < workshop.slots.length) {
    const slot = workshop.slots[slotIndex]
    if (typeof slot.cupoDisponible === 'number') {
      slot.cupoDisponible = Math.min(slot.cupoDisponible + 1, slot.cupoMax ?? workshop.cupoPorSesion)
      await workshop.save()
    }
  }

  return NextResponse.json({ ok: true })
}
