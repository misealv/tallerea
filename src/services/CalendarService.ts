import 'server-only'
import { Types } from 'mongoose'
import dbConnect from '@/lib/db'
import Workshop from '@/models/Workshop'
import Booking from '@/models/Booking'
import Enrollment from '@/models/Enrollment'

interface SlotLean {
  dia?: string
  horaInicio: string
  horaFin: string
  fecha?: Date
  reservas: number
  cancelado: boolean
}

interface WorkshopLean {
  _id: Types.ObjectId
  titulo: string
  slug: string
  cupoPorSesion: number
  modalidad?: 'presencial' | 'online' | 'hibrido'
  tipo?: string
  modeloAcceso?: 'puntual' | 'recurrente'
  slots: SlotLean[]
}

interface BookingCountLean {
  workshopId: Types.ObjectId
  slotIndex: number
}

interface EnrollmentSlotLean {
  workshopId: Types.ObjectId
  slotIndex: number | null
}

interface ReagendamientoLean {
  workshopId: Types.ObjectId
  slotIndex: number
}

export interface UpcomingSlot {
  workshopId: string
  workshopTitulo: string
  workshopSlug: string
  workshopModalidad?: 'presencial' | 'online' | 'hibrido'
  workshopTipo?: string
  modeloAcceso?: 'puntual' | 'recurrente'
  slotIndex: number
  horaInicio: string
  horaFin: string
  fecha: string // YYYY-MM-DD (zona civil)
  cancelado: boolean
  reservas: number
  cupo: number
  reagendamientosPendientes: number
}

export interface UpcomingSlotsParams {
  ownerId: string
  from: Date
  to: Date
}

// Mapeo de nombre español → número de día ISO (0=dom, 1=lun, ..., 6=sáb)
const DIA_TO_DOW: Record<string, number> = {
  domingo:   0,
  lunes:     1,
  martes:    2,
  miercoles: 3,
  jueves:    4,
  viernes:   5,
  sabado:    6,
}

// Retorna el día de la semana (0=dom...6=sáb) de una Date en zona Santiago.
function getDayOfWeekCL(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    weekday: 'short',
  }).formatToParts(d)
  const dayStr = parts.find(p => p.type === 'weekday')?.value ?? 'Sun'
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[dayStr] ?? 0
}

// [TZ] Convierte una Date a YYYY-MM-DD en zona civil de Santiago.
// Garantiza consistencia entre el rango y los slots almacenados (que
// pueden venir como medianoche UTC, o con hora local, sin importar).
function toYMDCL(d: Date): string {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
}

export const CalendarService = {
  /**
   * Devuelve slots dentro del rango [from, to) pertenecientes a workshops
   * del owner. Soporta legacy: el userId puede figurar como `ownerId` o
   * como `accountId` en Workshop (igual que el dashboard).
   * Incluye conteo de reservas reales y reagendamientos pendientes por slot.
   */
  async getUpcomingSlots(params: UpcomingSlotsParams): Promise<UpcomingSlot[]> {
    const { ownerId, from, to } = params
    await dbConnect()

    const ownerFilter = { $or: [{ ownerId }, { accountId: ownerId }] }

    const workshops = await Workshop.find({
      ...ownerFilter,
      activo: true,
      deletedAt: null,
    })
      .select('_id titulo slug cupoPorSesion modalidad tipo modeloAcceso slots')
      .lean<WorkshopLean[]>()

    if (workshops.length === 0) return []

    // [TZ-FIX] Usar ISO UTC para el rango, igual que para s.fecha.
    // Con from=T12:00:00Z el slice(0,10) da el mismo día que toYMDCL,
    // pero es consistente con la comparación de slot.fecha.
    const fromYMD = from.toISOString().slice(0, 10)
    const toYMD   = to.toISOString().slice(0, 10)
    const inRangeYMD = (ymd: string) => ymd >= fromYMD && ymd < toYMD

    // Pre-filtro: slots dentro de rango por workshop
    const workshopSlotsMap = new Map<string, { slotIdx: number; slot: SlotLean; virtualFecha: string }[]>()
    const workshopIdsWithSlots: Types.ObjectId[] = []

    for (const w of workshops) {
      const inRange: { slotIdx: number; slot: SlotLean; virtualFecha: string }[] = []
      w.slots.forEach((s, i) => {
        if (s.fecha) {
          // [TZ-FIX] Slots se almacenan como medianoche UTC (2026-05-18T00:00:00Z = lunes 18).
          // toYMDCL() los convierte a zona Santiago (UTC-4) y los retrocede 1 día → domingo 17.
          // Usar toISOString() igual que la API /api/tallerista/calendar para consistencia.
          const ymd = new Date(s.fecha).toISOString().slice(0, 10)
          if (inRangeYMD(ymd)) inRange.push({ slotIdx: i, slot: s, virtualFecha: ymd })
        } else if (s.dia && DIA_TO_DOW[s.dia] !== undefined) {
          // [TZ-FIX] Calcular la próxima ocurrencia del weekday dentro del rango.
          // DIA_OFFSET (offset fijo desde from) era incorrecto: asumía que from
          // siempre es lunes. Ahora: daysAhead=0 si hoy ES ese día, 1-6 si no.
          const fromDow    = getDayOfWeekCL(from)
          const targetDow  = DIA_TO_DOW[s.dia]
          const daysAhead  = (targetDow - fromDow + 7) % 7
          const projected  = new Date(from.getTime() + daysAhead * 24 * 60 * 60 * 1000)
          const ymd = toYMDCL(projected)
          if (inRangeYMD(ymd)) inRange.push({ slotIdx: i, slot: s, virtualFecha: ymd })
        }
      })
      if (inRange.length > 0) {
        workshopSlotsMap.set(String(w._id), inRange)
        workshopIdsWithSlots.push(w._id)
      }
    }

    if (workshopIdsWithSlots.length === 0) return []

    // 3 queries paralelas: bookings, enrollments, reagendamientos pendientes
    const [allBookings, allEnrollments, allReagend] = await Promise.all([
      Booking.find({
        workshopId: { $in: workshopIdsWithSlots },
        estado: { $nin: ['cancelada'] },
        activo: true,
      })
        .select('workshopId slotIndex')
        .lean<BookingCountLean[]>(),
      Enrollment.find({
        workshopId: { $in: workshopIdsWithSlots },
        estado: { $nin: ['cancelado'] },
        slotIndex: { $ne: null },
        activo: true,
      })
        .select('workshopId slotIndex')
        .lean<EnrollmentSlotLean[]>(),
      Booking.find({
        workshopId: { $in: workshopIdsWithSlots },
        'reagendamiento.estado': 'pendiente',
        activo: true,
      })
        .select('workshopId slotIndex')
        .lean<ReagendamientoLean[]>(),
    ])

    // Indexar conteos por workshopId+slotIndex
    const reservasByKey = new Map<string, number>()
    for (const b of allBookings) {
      const key = `${String(b.workshopId)}:${b.slotIndex}`
      reservasByKey.set(key, (reservasByKey.get(key) ?? 0) + 1)
    }
    for (const e of allEnrollments) {
      const key = `${String(e.workshopId)}:${e.slotIndex}`
      reservasByKey.set(key, (reservasByKey.get(key) ?? 0) + 1)
    }
    const reagendByKey = new Map<string, number>()
    for (const r of allReagend) {
      const key = `${String(r.workshopId)}:${r.slotIndex}`
      reagendByKey.set(key, (reagendByKey.get(key) ?? 0) + 1)
    }

    const result: UpcomingSlot[] = []
    for (const w of workshops) {
      const slotsInRange = workshopSlotsMap.get(String(w._id))
      if (!slotsInRange) continue
      for (const { slot: s, slotIdx: i, virtualFecha } of slotsInRange) {
        const key = `${String(w._id)}:${i}`
        result.push({
          workshopId: String(w._id),
          workshopTitulo: w.titulo,
          workshopSlug: w.slug,
          workshopModalidad: w.modalidad,
          workshopTipo: w.tipo,
          modeloAcceso: w.modeloAcceso,
          slotIndex: i,
          horaInicio: s.horaInicio,
          horaFin: s.horaFin,
          fecha: virtualFecha,
          cancelado: s.cancelado,
          reservas: reservasByKey.get(key) ?? s.reservas ?? 0,
          cupo: w.cupoPorSesion,
          reagendamientosPendientes: reagendByKey.get(key) ?? 0,
        })
      }
    }

    // Orden: por fecha asc, luego por horaInicio asc
    result.sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
      return a.horaInicio < b.horaInicio ? -1 : a.horaInicio > b.horaInicio ? 1 : 0
    })

    return result
  },
}
