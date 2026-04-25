import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Workshop from '@/models/Workshop'
import Booking from '@/models/Booking'
import Enrollment from '@/models/Enrollment'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

interface SlotLean { dia?: string; horaInicio: string; horaFin: string; fecha?: Date; reservas: number; cancelado: boolean }

// PATCH /api/tallerista/calendar — cancelar o restaurar un slot individual
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const role = session.user.role
  const estado = (session.user as { tallerEstado?: string }).tallerEstado
  if (role !== 'admin' && estado !== 'aprobado') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { workshopId?: string; slotIndex?: number; cancelado?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }

  const { workshopId, slotIndex, cancelado } = body
  if (!workshopId || typeof slotIndex !== 'number' || typeof cancelado !== 'boolean') {
    return NextResponse.json({ error: 'Faltan campos: workshopId, slotIndex, cancelado' }, { status: 400 })
  }

  await dbConnect()

  // Verificar ownership
  const workshop = await Workshop.findOne({ _id: workshopId, ownerId: session.user.id, activo: true })
  if (!workshop) return NextResponse.json({ error: 'Taller no encontrado' }, { status: 404 })

  if (slotIndex < 0 || slotIndex >= workshop.slots.length) {
    return NextResponse.json({ error: 'slotIndex fuera de rango' }, { status: 400 })
  }

  workshop.slots[slotIndex].cancelado = cancelado
  await workshop.save()

  return NextResponse.json({ ok: true, cancelado })
}
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
    }).select('_id titulo slug cupoPorSesion slots fechaInicio fechaFin').lean<WorkshopLean[]>()

    // Offset en días desde el lunes para cada día de semana
    const DIA_OFFSET: Record<string, number> = {
      lunes: 0, martes: 1, miercoles: 2, jueves: 3, viernes: 4, sabado: 5, domingo: 6,
    }

    // [TZ-FIX] Comparar por fecha civil (YYYY-MM-DD) en UTC, no por timestamp.
    // Los slots se guardan como medianoche UTC (e.g. 2026-04-27T00:00:00Z).
    // `from` en UTC-3 = 2026-04-27T03:00:00Z desplaza la comparación → excluye slots del propio día.
    const fromYMD = from.toISOString().slice(0, 10)
    const toYMD = to.toISOString().slice(0, 10)
    const fechaToYMD = (d: Date) => new Date(d).toISOString().slice(0, 10)
    const inRangeYMD = (ymd: string) => ymd >= fromYMD && ymd < toYMD

    // [N+1 FIX] Pre-calcular slots en rango por workshop
    // Soporta dos modelos:
    //   1. Slot con `fecha` concreta  → filtra por rango directamente
    //   2. Slot con `dia` (día de semana, sin fecha) → proyecta la fecha virtual en la semana solicitada
    const workshopSlotsMap = new Map<string, { slotIdx: number; slot: SlotLean; virtualFecha: string }[]>()
    const workshopIdsWithSlots: Types.ObjectId[] = []

    for (const w of workshops) {
      const inRange: { slotIdx: number; slot: SlotLean; virtualFecha: string }[] = []

      w.slots.forEach((s, i) => {
        if (s.fecha) {
          // Slot con fecha concreta — comparar como fecha civil YYYY-MM-DD
          const ymd = fechaToYMD(s.fecha)
          if (inRangeYMD(ymd)) {
            inRange.push({ slotIdx: i, slot: s, virtualFecha: ymd })
          }
        } else if (s.dia && DIA_OFFSET[s.dia] !== undefined) {
          // Slot con día de semana → proyectar en la semana [from, to)
          const projected = new Date(from.getTime() + DIA_OFFSET[s.dia] * 24 * 60 * 60 * 1000)
          const ymd = projected.toISOString().slice(0, 10)
          if (inRangeYMD(ymd)) {
            inRange.push({ slotIdx: i, slot: s, virtualFecha: ymd })
          }
        }
      })

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

    // [FIX] También contar Enrollments puntuales y clasePrueba por slot
    // (Booking solo existe para suscripciones recurrentes; Enrollment cubre puntual y prueba)
    interface EnrollmentSlotLean { workshopId: Types.ObjectId; slotIndex: number | null }
    const allEnrollments = workshopIdsWithSlots.length > 0
      ? await Enrollment.find({
          workshopId: { $in: workshopIdsWithSlots },
          estado: { $nin: ['cancelado'] },
          slotIndex: { $ne: null },
          activo: true,
        }).select('workshopId slotIndex').lean<EnrollmentSlotLean[]>()
      : []

    // Indexar bookings + enrollments por workshopId+slotIndex
    const bookingsByKey = new Map<string, number>()
    for (const b of allBookings) {
      const key = `${String(b.workshopId)}:${b.slotIndex}`
      bookingsByKey.set(key, (bookingsByKey.get(key) ?? 0) + 1)
    }
    for (const e of allEnrollments) {
      const key = `${String(e.workshopId)}:${e.slotIndex}`
      bookingsByKey.set(key, (bookingsByKey.get(key) ?? 0) + 1)
    }

    const result = []
    for (const w of workshops) {
      const slotsInRange = workshopSlotsMap.get(String(w._id))
      if (!slotsInRange) continue
      for (const { slot: s, slotIdx: i, virtualFecha } of slotsInRange) {
        const key = `${String(w._id)}:${i}`
        result.push({
          workshopId: String(w._id),
          workshopTitulo: w.titulo,
          workshopSlug: w.slug,
          slotIndex: i,
          horaInicio: s.horaInicio,
          horaFin: s.horaFin,
          fecha: virtualFecha,
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
