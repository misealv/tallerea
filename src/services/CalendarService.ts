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

// Offset en días desde el lunes para slots con `dia` (sin fecha concreta)
const DIA_OFFSET: Record<string, number> = {
  lunes: 0,
  martes: 1,
  miercoles: 2,
  jueves: 3,
  viernes: 4,
  sabado: 5,
  domingo: 6,
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

    // [TZ-FIX] Comparar por fecha civil YYYY-MM-DD para evitar drift por offset UTC.
    const fromYMD = from.toISOString().slice(0, 10)
    const toYMD = to.toISOString().slice(0, 10)
    const fechaToYMD = (d: Date) => new Date(d).toISOString().slice(0, 10)
    const inRangeYMD = (ymd: string) => ymd >= fromYMD && ymd < toYMD

    // Pre-filtro: slots dentro de rango por workshop
    const workshopSlotsMap = new Map<string, { slotIdx: number; slot: SlotLean; virtualFecha: string }[]>()
    const workshopIdsWithSlots: Types.ObjectId[] = []

    for (const w of workshops) {
      const inRange: { slotIdx: number; slot: SlotLean; virtualFecha: string }[] = []
      w.slots.forEach((s, i) => {
        if (s.fecha) {
          const ymd = fechaToYMD(s.fecha)
          if (inRangeYMD(ymd)) inRange.push({ slotIdx: i, slot: s, virtualFecha: ymd })
        } else if (s.dia && DIA_OFFSET[s.dia] !== undefined) {
          const projected = new Date(from.getTime() + DIA_OFFSET[s.dia] * 24 * 60 * 60 * 1000)
          const ymd = projected.toISOString().slice(0, 10)
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
