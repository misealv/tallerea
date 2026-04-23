import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Workshop from '@/models/Workshop'
import Booking from '@/models/Booking'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

interface SlotLean { horaInicio: string; horaFin: string; fecha?: Date; reservas: number; cancelado: boolean }
interface WorkshopLean {
  _id: Types.ObjectId
  titulo: string
  slug: string
  cupoPorSesion: number
  slots: SlotLean[]
}
interface BookingLean { workshopId: Types.ObjectId; slotIndex: number; studentId: Types.ObjectId; estado: string }

// GET /api/tallerista/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Gate de rol: solo tallerista aprobado o admin
  const role = session.user.role
  const estado = (session.user as { tallerEstado?: string }).tallerEstado
  if (role !== 'admin' && estado !== 'aprobado') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const fromStr = searchParams.get('from')
    const toStr = searchParams.get('to')

    // [TZ] Interpretar YYYY-MM-DD en hora local de Chile (UTC-3, Santiago sin DST)
    const parseLocalDate = (s: string) => new Date(`${s}T00:00:00-03:00`)
    const from = fromStr ? parseLocalDate(fromStr) : (() => {
      const d = new Date()
      d.setDate(d.getDate() - d.getDay() + 1)
      d.setHours(0, 0, 0, 0)
      return d
    })()
    const to = toStr ? parseLocalDate(toStr) : new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000)

    await dbConnect()

    const workshops = await Workshop.find({
      ownerId: session.user.id,
      activo: true,
    }).select('_id titulo slug cupoPorSesion slots').lean<WorkshopLean[]>()

    // [N+1 FIX] Pre-calcular slots en rango por workshop y hacer UNA sola query de Bookings
    const workshopSlotsMap = new Map<string, { slotIdx: number; slot: SlotLean }[]>()
    const workshopIdsWithSlots: Types.ObjectId[] = []
    for (const w of workshops) {
      const inRange = w.slots
        .map((s, i) => ({ slotIdx: i, slot: s }))
        .filter(({ slot }) => slot.fecha && new Date(slot.fecha) >= from && new Date(slot.fecha) < to)
      if (inRange.length > 0) {
        workshopSlotsMap.set(String(w._id), inRange)
        workshopIdsWithSlots.push(w._id)
      }
    }

    // Una sola query agregando todos los bookings relevantes
    const allBookings = workshopIdsWithSlots.length > 0
      ? await Booking.find({
          workshopId: { $in: workshopIdsWithSlots },
          estado: { $nin: ['cancelada'] },
        }).select('workshopId slotIndex studentId').lean<BookingLean[]>()
      : []

    // Indexar bookings por workshopId+slotIndex
    const bookingsByKey = new Map<string, number>()
    for (const b of allBookings) {
      const key = `${String(b.workshopId)}:${b.slotIndex}`
      bookingsByKey.set(key, (bookingsByKey.get(key) ?? 0) + 1)
    }

    const result = []
    for (const w of workshops) {
      const slotsInRange = workshopSlotsMap.get(String(w._id))
      if (!slotsInRange) continue
      for (const { slot: s, slotIdx: i } of slotsInRange) {
        const key = `${String(w._id)}:${i}`
        result.push({
          workshopId: String(w._id),
          workshopTitulo: w.titulo,
          workshopSlug: w.slug,
          slotIndex: i,
          horaInicio: s.horaInicio,
          horaFin: s.horaFin,
          fecha: s.fecha,
          cancelado: s.cancelado,
          reservas: bookingsByKey.get(key) ?? s.reservas,
          cupo: w.cupoPorSesion,
        })
      }
    }

    return NextResponse.json({ data: result, from: from.toISOString(), to: to.toISOString() })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
