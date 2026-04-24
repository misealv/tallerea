import dbConnect from '@/lib/db'
import Booking, { IBooking } from '@/models/Booking'
import Workshop from '@/models/Workshop'
import Subscription from '@/models/Subscription'
import { SubscriptionService } from '@/services/SubscriptionService'

interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
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
    slotIndex: number
  ): Promise<IBooking> {
    await dbConnect()

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
    if (new Date(slot.fecha) <= new Date()) {
      throw new Error('No se puede reservar una sesión que ya ocurrió')
    }

    // Validar cupo
    if (slot.reservas >= workshop.cupoPorSesion) {
      throw new Error('Sesión llena — no hay cupo disponible')
    }

    // Validar que no haya reserva duplicada activa
    const existing = await Booking.findOne({
      workshopId, studentId, slotIndex,
      estado: { $ne: 'cancelada' },
    })
    if (existing) throw new Error('Ya tienes una reserva en esta sesión')

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
    try {
      const booking = await new Booking({
        subscriptionId,
        workshopId,
        studentId,
        slotIndex,
        fecha: slot.fecha,
        estado: 'reservada',
      }).save()
      return booking
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
  },

  // Cancelar reserva (dentro del plazo)
  async cancel(bookingId: string): Promise<IBooking> {
    await dbConnect()

    const booking = await Booking.findById(bookingId)
    if (!booking) throw new Error('Reserva no encontrada')
    if (booking.estado !== 'reservada') throw new Error('Solo se pueden cancelar reservas activas')

    // Verificar plazo de cancelación
    const workshop = await Workshop.findById(booking.workshopId)
    if (workshop?.plan?.horasAntesCancelacion) {
      const limite = new Date(booking.fecha)
      limite.setHours(limite.getHours() - workshop.plan.horasAntesCancelacion)
      if (new Date() > limite) {
        throw new Error(
          `Plazo de cancelación vencido (${workshop.plan.horasAntesCancelacion}h antes)`
        )
      }
    }

    booking.estado = 'cancelada'
    booking.canceladaEn = new Date()
    await booking.save()

    // Devolver sesión a la suscripción
    await SubscriptionService.devolverSesion(String(booking.subscriptionId))

    // [RACE] Decrementar reservas atómicamente
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

    // No-show con política reagendar: devolver sesión
    if (estado === 'no_asistio') {
      const workshop = await Workshop.findById(booking.workshopId)
      if (workshop?.plan?.politicaNoShow === 'reagendar_una_vez') {
        await SubscriptionService.devolverSesion(String(booking.subscriptionId))
      }
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
    if (new Date(newSlot.fecha) <= new Date()) {
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
}
