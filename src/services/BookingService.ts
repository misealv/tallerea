import dbConnect from '@/lib/db'
import Booking, { IBooking } from '@/models/Booking'
import Workshop from '@/models/Workshop'
import Subscription from '@/models/Subscription'
import { SubscriptionService } from '@/services/SubscriptionService'
import { UserService } from '@/services/UserService'
import User, { IDependent, IUser } from '@/models/User'
import { sendBookingConfirmadoAlumno, sendNuevaReservaTallerista, sendReservaCancelada } from '@/lib/resend'

// Formatea fecha+hora del slot en zona Chile para emails
function formatSlotForEmail(fecha: Date, horaInicio: string, horaFin: string): { fechaTexto: string; horaTexto: string } {
  // slot.fecha se guarda como UTC midnight (ej: 2026-05-30T00:00:00Z).
  // Usar timeZone: 'UTC' evita que America/Santiago (UTC-4) retroceda el día
  // y muestre la fecha un día antes de la real.
  const fechaTexto = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'UTC',
  }).format(new Date(fecha))
  return { fechaTexto, horaTexto: `${horaInicio} - ${horaFin}` }
}

// [TZ] Offset (en minutos) de America/Santiago para un instante dado.
// Considera el horario de verano (UTC-3) vs invierno (UTC-4).
function santiagoOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const map: Record<string, number> = {}
  for (const p of parts) if (p.type !== 'literal') map[p.type] = Number(p.value)
  const asUTC = Date.UTC(
    map.year, map.month - 1, map.day,
    map.hour === 24 ? 0 : map.hour, map.minute, map.second
  )
  return (asUTC - at.getTime()) / 60000
}

// [TZ] Instante UTC real del fin del slot. La fecha del slot se almacena como
// medianoche UTC del día civil y horaFin es hora local de Santiago ("HH:mm").
// Sin esto, setUTCHours() interpretaba la hora chilena como UTC y marcaba la
// clase como "ya ocurrió" 3-4 h antes de tiempo.
function slotEndInstant(fecha: Date, horaFin: string | undefined): Date {
  const ymd = new Date(fecha).toISOString().slice(0, 10)
  const [y, mo, d] = ymd.split('-').map(Number)
  const [h, mi] = (horaFin ?? '23:59').split(':').map(Number)
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, 0, 0)
  const off1 = santiagoOffsetMinutes(new Date(utcGuess))
  const utc = utcGuess - off1 * 60000
  const off2 = santiagoOffsetMinutes(new Date(utc))
  return off2 === off1 ? new Date(utc) : new Date(utcGuess - off2 * 60000)
}

interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface UpcomingBookingDetail {
  bookingId: string
  subscriptionId: string
  workshopId: string
  workshopTitulo: string
  workshopSlug: string
  workshopModalidad?: 'presencial' | 'online' | 'hibrido'
  workshopTipo?: string
  talleristaNombre: string
  location: {
    nombre: string
    direccion: string
    comuna: string
    ciudad: string
  } | null
  slotIndex: number
  fecha: Date
  horaInicio: string
  horaFin: string
  cancelado: boolean
  dependentNombre?: string
  reagendamiento: {
    estado: 'pendiente' | 'aprobado' | 'rechazado'
    slotDestinoIndex?: number
  } | null
}

export const BookingService = {

  async getAll(
    filters?: Record<string, unknown>,
    page = 1,
    limit = 20
  ): Promise<PaginatedResult<IBooking>> {
    await dbConnect()
    const query = { activo: true, ...filters }
    const [data, total] = await Promise.all([
      Booking.find(query)
        .populate('workshopId', 'titulo slug cupoPorSesion')
        .populate('studentId', 'name email')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ fecha: -1 })
        .lean<IBooking[]>(),
      Booking.countDocuments(query),
    ])
    return { data, total, page, limit }
  },

  async getById(id: string): Promise<IBooking | null> {
    await dbConnect()
    return Booking.findOne({ _id: id, activo: true })
      .populate('workshopId', 'titulo slug plan cupoPorSesion slots')
      .populate('studentId', 'name email')
      .lean<IBooking>()
  },

  // Reservar sesión
  async reserve(
    subscriptionId: string,
    workshopId: string,
    studentId: string,
    slotIndex: number,
    dependentId?: string
  ): Promise<IBooking> {
    await dbConnect()

    // Validar ownership y obtener snapshot del dependiente
    let dependentNombreSnapshot: string | undefined
    if (dependentId) {
      const owns = await UserService.ownsDependent(studentId, dependentId)
      if (!owns) throw new Error('Dependiente no encontrado o no te pertenece')
      const userDoc = await User.findOne({ _id: studentId })
        .select('dependents')
        .lean<Pick<IUser, 'dependents'>>()
      const dep = userDoc?.dependents.find((d: IDependent) => String(d._id) === dependentId)
      dependentNombreSnapshot = dep?.nombre
    }

    // Validar suscripción activa
    const sub = await Subscription.findById(subscriptionId)
    if (!sub || sub.estado !== 'activa') throw new Error('Suscripción no activa')
    if (String(sub.workshopId) !== workshopId) throw new Error('Suscripción no corresponde al taller')
    if (sub.sesionesDisponibles <= 0) throw new Error('No quedan sesiones disponibles')

    // Validar slot
    const workshop = await Workshop.findById(workshopId)
    if (!workshop) throw new Error('Taller no encontrado')
    const slot = workshop.slots[slotIndex]
    if (!slot) throw new Error('Sesión no encontrada')
    if (slot.cancelado) throw new Error('Sesión cancelada')
    if (!slot.fecha) throw new Error('Sesión sin fecha definida')
    const slotEndR = slotEndInstant(slot.fecha, slot.horaFin as string | undefined)
    if (slotEndR <= new Date()) {
      throw new Error('No se puede reservar una sesión que ya ocurrió')
    }

    // Validar cupo
    if (slot.reservas >= workshop.cupoPorSesion) {
      throw new Error('Sesión llena — no hay cupo disponible')
    }

    // Validar que no haya reserva duplicada activa (mismo titular+slot+dependiente)
    const existing = await Booking.findOne({
      workshopId, studentId, slotIndex,
      estado: { $ne: 'cancelada' },
      ...(dependentId ? { dependentId } : { dependentId: { $exists: false } }),
    })
    if (existing) {
      throw new Error(
        dependentId
          ? 'Ese dependiente ya tiene una reserva en esta sesión'
          : 'Ya tienes una reserva en esta sesión'
      )
    }

    // Consumir sesión de la suscripción (atómico)
    await SubscriptionService.consumeSesion(subscriptionId)

    // [RACE] Incrementar reservas en el slot atómicamente con verificación de cupo
    const updated = await Workshop.updateOne(
      {
        _id: workshopId,
        [`slots.${slotIndex}.cancelado`]: false,
        [`slots.${slotIndex}.reservas`]: { $lt: workshop.cupoPorSesion },
      },
      { $inc: { [`slots.${slotIndex}.reservas`]: 1 } }
    )
    if (updated.modifiedCount === 0) {
      // Devolver sesión si falla el incremento de cupo
      await SubscriptionService.devolverSesion(subscriptionId).catch(() => null)
      throw new Error('Sesión llena — no hay cupo disponible')
    }

    // Crear booking — si falla, revertir sesión y cupo
    let booking: IBooking
    try {
      booking = await new Booking({
        subscriptionId,
        workshopId,
        studentId,
        slotIndex,
        fecha: slot.fecha,
        estado: 'reservada',
        ...(dependentId
          ? { dependentId, dependentNombreSnapshot }
          : {}),
      }).save()
    } catch (err) {
      // Compensar: devolver sesión y liberar cupo
      await Promise.all([
        SubscriptionService.devolverSesion(subscriptionId).catch(() => null),
        Workshop.updateOne(
          { _id: workshopId },
          { $inc: { [`slots.${slotIndex}.reservas`]: -1 } }
        ).catch(() => null),
      ])
      throw err
    }

    // Notificaciones por email (fire-and-forget, no bloquean)
    try {
      const [student, workshopFull] = await Promise.all([
        User.findById(studentId).select('name email').lean<{ name: string; email: string }>(),
        Workshop.findById(workshopId)
          .select('titulo slots')
          .populate<{ ownerId: { name: string; email: string } }>('ownerId', 'name email')
          .lean<{ titulo: string; slots: Array<{ horaInicio: string; horaFin: string }>; ownerId?: { name: string; email: string } }>(),
      ])
      if (student && workshopFull && slot.fecha) {
        const { fechaTexto, horaTexto } = formatSlotForEmail(slot.fecha, slot.horaInicio, slot.horaFin)
        await Promise.all([
          sendBookingConfirmadoAlumno({
            studentEmail: student.email,
            studentName: student.name,
            workshopTitle: workshopFull.titulo,
            fechaClase: fechaTexto,
            horaClase: horaTexto,
            dependentNombre: dependentNombreSnapshot,
          }).catch(() => null),
          workshopFull.ownerId
            ? sendNuevaReservaTallerista({
                profesorEmail: workshopFull.ownerId.email,
                profesorNombre: workshopFull.ownerId.name,
                studentName: student.name,
                workshopTitle: workshopFull.titulo,
                fechaClase: fechaTexto,
                horaClase: horaTexto,
                dependentNombre: dependentNombreSnapshot,
              }).catch(() => null)
            : Promise.resolve(),
        ])
      }
    } catch {
      // No bloquear por fallo de email
    }

    return booking
  },

  // Cancelar reserva (dentro del plazo)
  async cancel(bookingId: string): Promise<IBooking> {
    await dbConnect()

    const booking = await Booking.findById(bookingId)
    if (!booking) throw new Error('Reserva no encontrada')
    if (booking.estado !== 'reservada') throw new Error('Solo se pueden cancelar reservas activas')

    // Verificar plazo de cancelación
    const workshop = await Workshop.findById(booking.workshopId)
    const dentroDelPlazo = (() => {
      if (!workshop?.plan?.horasAntesCancelacion) return true
      const limite = new Date(booking.fecha)
      limite.setHours(limite.getHours() - workshop.plan.horasAntesCancelacion)
      return new Date() <= limite
    })()

    if (!dentroDelPlazo) {
      throw new Error(
        `Plazo de cancelación vencido (${workshop!.plan.horasAntesCancelacion}h antes)`
      )
    }

    booking.estado = 'cancelada'
    booking.canceladaEn = new Date()
    booking.canceladaRazon = 'alumno_dentro_plazo'
    await booking.save()

    // Devolver sesión a la suscripción (dentro de plazo → NO consume prepagado)
    await SubscriptionService.devolverSesion(String(booking.subscriptionId))

    // [RACE] Decrementar reservas atómicamente
    if (workshop) {
      await Workshop.updateOne(
        { _id: booking.workshopId },
        { $inc: { [`slots.${booking.slotIndex}.reservas`]: -1 } }
      )
    }

    // Notificar a alumno y tallerista (fire-and-forget)
    try {
      const [student, workshopFull] = await Promise.all([
        User.findById(booking.studentId).select('name email').lean<{ name: string; email: string }>(),
        Workshop.findById(booking.workshopId)
          .select('titulo slots')
          .populate<{ ownerId: { name: string; email: string } }>('ownerId', 'name email')
          .lean<{ titulo: string; slots: Array<{ horaInicio: string; horaFin: string; fecha?: Date }>; ownerId?: { name: string; email: string } }>(),
      ])
      const slotForEmail = workshopFull?.slots?.[booking.slotIndex]
      if (student && workshopFull && slotForEmail && booking.fecha) {
        const { fechaTexto, horaTexto } = formatSlotForEmail(booking.fecha, slotForEmail.horaInicio, slotForEmail.horaFin)
        const dependentNombre = (booking as unknown as { dependentNombreSnapshot?: string }).dependentNombreSnapshot
        await Promise.all([
          sendReservaCancelada({
            email: student.email,
            nombre: student.name,
            esAlumno: true,
            workshopTitle: workshopFull.titulo,
            fechaClase: fechaTexto,
            horaClase: horaTexto,
            razon: 'Cancelaste tu reserva dentro del plazo',
            dependentNombre,
          }).catch(() => null),
          workshopFull.ownerId
            ? sendReservaCancelada({
                email: workshopFull.ownerId.email,
                nombre: workshopFull.ownerId.name,
                esAlumno: false,
                workshopTitle: workshopFull.titulo,
                fechaClase: fechaTexto,
                horaClase: horaTexto,
                razon: `${student.name} canceló su reserva dentro del plazo`,
                dependentNombre,
              }).catch(() => null)
            : Promise.resolve(),
        ])
      }
    } catch {
      // No bloquear por fallo de email
    }

    return booking
  },

  // Cancelar reserva fuera de plazo (tallerista o sistema)
  async cancelFueraDePlazo(bookingId: string, razon: 'alumno_fuera_plazo' | 'tallerista' | 'ciclo_vencido'): Promise<IBooking> {
    await dbConnect()

    const booking = await Booking.findById(bookingId)
    if (!booking) throw new Error('Reserva no encontrada')
    if (booking.estado !== 'reservada') throw new Error('Solo se pueden cancelar reservas activas')

    booking.estado = 'cancelada'
    booking.canceladaEn = new Date()
    booking.canceladaRazon = razon
    await booking.save()

    // [FIX 2026-05] Fuera de plazo NO devuelve saldo (ya consumido en la reserva).
    // Antes se llamaba consumePrepaid que dobleaba el conteo en clasesPrepagadas.consumidas.
    // Modelo A puro: consumir en reserva, no devolver en no-show/fuera-plazo.

    // Liberar cupo del slot
    const workshop = await Workshop.findById(booking.workshopId)
    if (workshop) {
      await Workshop.updateOne(
        { _id: booking.workshopId },
        { $inc: { [`slots.${booking.slotIndex}.reservas`]: -1 } }
      )
    }

    return booking
  },

  // Marcar asistencia
  async markAttendance(
    bookingId: string,
    estado: 'asistio' | 'no_asistio'
  ): Promise<IBooking> {
    await dbConnect()

    const booking = await Booking.findById(bookingId)
    if (!booking) throw new Error('Reserva no encontrada')
    if (booking.estado !== 'reservada') throw new Error('Solo se puede marcar asistencia de reservas activas')

    booking.estado = estado
    await booking.save()

    if (estado === 'asistio') {
      // [FIX 2026-05] Asistencia confirmada NO consume saldo aparte: ya fue
      // descontado al crear el Booking vía consumeSesion. Modelo A puro.
    } else {
      // no_asistio: verificar política del taller
      const workshop = await Workshop.findById(booking.workshopId)
      if (workshop?.plan?.politicaNoShow === 'reagendar_una_vez') {
        // Política: devolver sesión (el alumno puede reagendar)
        await SubscriptionService.devolverSesion(String(booking.subscriptionId))
      }
      // Política por defecto: no-show NO devuelve saldo (sesión ya consumida en reserva).
    }

    return booking
  },

  // Cambiar de sesión (swap)
  async changeSlot(
    bookingId: string,
    newSlotIndex: number
  ): Promise<IBooking> {
    await dbConnect()

    const booking = await Booking.findById(bookingId)
    if (!booking) throw new Error('Reserva no encontrada')
    if (booking.estado !== 'reservada') throw new Error('Solo se pueden cambiar reservas activas')

    const workshop = await Workshop.findById(booking.workshopId)
    if (!workshop) throw new Error('Taller no encontrado')

    // Verificar plazo
    if (workshop.plan?.horasAntesCancelacion) {
      const limite = new Date(booking.fecha)
      limite.setHours(limite.getHours() - workshop.plan.horasAntesCancelacion)
      if (new Date() > limite && !workshop.plan.permitirCambioPostPlazo) {
        throw new Error('Plazo de cambio de sesión vencido')
      }
    }

    // Verificar nuevo slot
    const newSlot = workshop.slots[newSlotIndex]
    if (!newSlot) throw new Error('Sesión destino no encontrada')
    if (newSlot.cancelado) throw new Error('Sesión destino cancelada')
    if (!newSlot.fecha) throw new Error('Sesión destino sin fecha definida')
    if (slotEndInstant(newSlot.fecha, newSlot.horaFin as string | undefined) <= new Date()) {
      throw new Error('No se puede cambiar a una sesión que ya ocurrió')
    }
    if (newSlot.reservas >= workshop.cupoPorSesion) throw new Error('Sesión destino sin cupo')

    // [RACE] Ocupar cupo del nuevo slot atómicamente con verificación
    const occupied = await Workshop.updateOne(
      {
        _id: booking.workshopId,
        [`slots.${newSlotIndex}.cancelado`]: false,
        [`slots.${newSlotIndex}.reservas`]: { $lt: workshop.cupoPorSesion },
      },
      { $inc: { [`slots.${newSlotIndex}.reservas`]: 1 } }
    )
    if (occupied.modifiedCount === 0) {
      throw new Error('Sesión destino sin cupo')
    }

    // [RACE] Liberar cupo del slot anterior atómicamente
    await Workshop.updateOne(
      { _id: booking.workshopId },
      { $inc: { [`slots.${booking.slotIndex}.reservas`]: -1 } }
    )

    // Actualizar booking
    booking.slotIndex = newSlotIndex
    booking.fecha = newSlot.fecha
    await booking.save()

    return booking
  },

  // Soft delete
  async delete(id: string): Promise<void> {
    await dbConnect()
    await Booking.findByIdAndUpdate(id, { activo: false })
  },

  // Bookings por suscripción
  async getBySubscription(subscriptionId: string): Promise<IBooking[]> {
    await dbConnect()
    return Booking.find({ subscriptionId, activo: true })
      .sort({ fecha: 1 })
      .lean<IBooking[]>()
  },

  // Bookings próximos de un alumno
  async getUpcomingByStudent(studentId: string): Promise<IBooking[]> {
    await dbConnect()
    return Booking.find({
      studentId,
      estado: 'reservada',
      fecha: { $gte: new Date() },
      activo: true,
    })
      .populate('workshopId', 'titulo slug')
      .sort({ fecha: 1 })
      .lean<IBooking[]>()
  },

  // Vista unificada de reservas próximas del alumno con datos enriquecidos.
  // Incluye horario del slot, modalidad, tipo, nombre del tallerista y
  // estado de reagendamiento para poder renderizar la lista completa sin
  // queries adicionales en el componente.
  async getDetailedUpcomingByStudent(studentId: string): Promise<UpcomingBookingDetail[]> {
    await dbConnect()

    interface RawBooking {
      _id: import('mongoose').Types.ObjectId
      subscriptionId: import('mongoose').Types.ObjectId
      workshopId: {
        _id: import('mongoose').Types.ObjectId
        titulo: string
        slug: string
        modalidad?: 'presencial' | 'online' | 'hibrido'
        tipo?: string
        slots: Array<{ horaInicio: string; horaFin: string; cancelado?: boolean }>
        ownerId?: { name?: string }
        locationId?: { nombre: string; direccion: string; comuna: string; ciudad: string }
      }
      slotIndex: number
      fecha: Date
      estado: string
      dependentNombreSnapshot?: string
      reagendamiento?: {
        estado: 'pendiente' | 'aprobado' | 'rechazado'
        slotDestinoIndex?: number
      }
    }

    const bookings = await Booking.find({
      studentId,
      estado: 'reservada',
      fecha: { $gte: new Date() },
      activo: true,
    })
      .populate({
        path: 'workshopId',
        select: 'titulo slug modalidad tipo slots ownerId locationId',
        populate: [
          { path: 'ownerId',    select: 'name' },
          { path: 'locationId', select: 'nombre direccion comuna ciudad' },
        ],
      })
      .sort({ fecha: 1 })
      .lean<RawBooking[]>()

    return bookings.map(b => {
      const slot = b.workshopId?.slots?.[b.slotIndex]
      const loc  = b.workshopId?.locationId
      return {
        bookingId:             String(b._id),
        subscriptionId:        String(b.subscriptionId),
        workshopId:            String(b.workshopId?._id),
        workshopTitulo:        b.workshopId?.titulo ?? '',
        workshopSlug:          b.workshopId?.slug ?? '',
        workshopModalidad:     b.workshopId?.modalidad,
        workshopTipo:          b.workshopId?.tipo,
        talleristaNombre:      b.workshopId?.ownerId?.name ?? '',
        location:              loc ? { nombre: loc.nombre, direccion: loc.direccion, comuna: loc.comuna, ciudad: loc.ciudad } : null,
        slotIndex:             b.slotIndex,
        fecha:                 b.fecha,
        horaInicio:            slot?.horaInicio ?? '',
        horaFin:               slot?.horaFin ?? '',
        cancelado:             slot?.cancelado ?? false,
        dependentNombre:       b.dependentNombreSnapshot,
        reagendamiento:        b.reagendamiento ?? null,
      }
    })
  },

  // El tallerista reserva una clase a nombre de un alumno suscrito.
  // Misma lógica de cupos y sesión que reserve(), pero:
  // - Ownership check: el taller debe pertenecer al tallerista (ownerId)
  // - No aplica restricción de horas de anticipación para el tallerista
  // - Booking queda marcado con reservadoPor: 'tallerista'
  // - Email de aviso al alumno (fire-and-forget)
  async reserveByTallerista(
    ownerId: string,
    subscriptionId: string,
    slotIndex: number
  ): Promise<IBooking> {
    await dbConnect()

    // Validar suscripción activa
    const sub = await Subscription.findById(subscriptionId)
    if (!sub || sub.estado !== 'activa') throw new Error('Suscripción no activa')
    if (sub.sesionesDisponibles <= 0) throw new Error('No quedan sesiones disponibles')

    // Ownership: el taller pertenece al tallerista (soporta workshops legacy con accountId)
    const workshop = await Workshop.findOne({
      _id: sub.workshopId,
      $or: [{ ownerId }, { accountId: ownerId }],
    })
    if (!workshop) throw new Error('No tienes acceso a este taller')

    const slot = workshop.slots[slotIndex]
    if (!slot) throw new Error('Sesión no encontrada')
    if (slot.cancelado) throw new Error('Sesión cancelada')
    if (!slot.fecha) throw new Error('Sesión sin fecha definida')
    // Usar fecha+horaFin (hora local Santiago) para determinar si el slot ya pasó.
    const slotEnd = slotEndInstant(slot.fecha, slot.horaFin as string | undefined)
    if (slotEnd <= new Date()) throw new Error('No se puede reservar una sesión que ya ocurrió')

    // Cupo disponible — usar conteo real de Bookings para detectar drift del caché
    const actualReservas = await Booking.countDocuments({
      workshopId: sub.workshopId,
      slotIndex,
      estado: { $ne: 'cancelada' },
      activo: true,
    })
    // Auto-heal: si slot.reservas está inflado respecto al conteo real, corregirlo con $min
    // (causado por bug en PATCH /calendar/students que no decrementaba el contador recurrente)
    if (slot.reservas > actualReservas) {
      await Workshop.updateOne(
        { _id: sub.workshopId },
        { $min: { [`slots.${slotIndex}.reservas`]: actualReservas } }
      ).catch(() => null)
    }
    if (actualReservas >= workshop.cupoPorSesion) throw new Error('Sesión llena — no hay cupo disponible')

    // Reserva duplicada (incluir dependentId si aplica)
    const dupFilter: Record<string, unknown> = {
      workshopId: sub.workshopId, studentId: sub.studentId, slotIndex,
      estado: { $ne: 'cancelada' },
    }
    if (sub.dependentId) dupFilter.dependentId = sub.dependentId
    else dupFilter.dependentId = { $exists: false }
    const existing = await Booking.findOne(dupFilter)
    if (existing) throw new Error('Este alumno ya tiene una reserva en esta sesión')

    // Consumir sesión (atómico)
    await SubscriptionService.consumeSesion(subscriptionId)

    // Decrementar cupo atómico
    const updated = await Workshop.updateOne(
      {
        _id: sub.workshopId,
        [`slots.${slotIndex}.cancelado`]: false,
        [`slots.${slotIndex}.reservas`]: { $lt: workshop.cupoPorSesion },
      },
      { $inc: { [`slots.${slotIndex}.reservas`]: 1 } }
    )
    if (updated.modifiedCount === 0) {
      await SubscriptionService.devolverSesion(subscriptionId).catch(() => null)
      throw new Error('Sesión llena — no hay cupo disponible')
    }

    let booking: IBooking
    try {
      booking = await new Booking({
        subscriptionId: sub._id,
        workshopId:     sub.workshopId,
        studentId:      sub.studentId,
        slotIndex,
        fecha:          slot.fecha,
        estado:         'reservada',
        reservadoPor:   'tallerista',
        // Propagar dependiente de la suscripción al booking
        ...(sub.dependentId && {
          dependentId:             sub.dependentId,
          dependentNombreSnapshot: sub.dependentNombreSnapshot,
        }),
      }).save()
    } catch (err) {
      await Promise.all([
        SubscriptionService.devolverSesion(subscriptionId).catch(() => null),
        Workshop.updateOne({ _id: sub.workshopId }, { $inc: { [`slots.${slotIndex}.reservas`]: -1 } }).catch(() => null),
      ])
      throw err
    }

    // Email al alumno (fire-and-forget)
    try {
      const student = await User.findById(sub.studentId).select('name email').lean<{ name: string; email: string }>()
      const owner   = await User.findById(ownerId).select('name').lean<{ name: string }>()
      if (student && owner) {
        const { sendBookingPorTallerista } = await import('@/lib/resend')
        const fechaDate = new Date(slot.fecha)
        // slot.fecha es UTC midnight → usar timeZone:'UTC' para no retroceder un día
        const fechaClase = fechaDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
        const horaClase  = slot.horaInicio
        await sendBookingPorTallerista({
          studentEmail:   student.email,
          studentName:    student.name,
          workshopTitle:  workshop.titulo,
          profesorNombre: owner.name,
          fechaClase,
          horaClase,
          dependentNombre: sub.dependentNombreSnapshot,
        })
      }
    } catch {
      // No bloquear el flujo por fallo de email
    }

    return booking
  },
}
