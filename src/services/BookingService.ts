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

    // Consumir sesión de la suscripción
    await SubscriptionService.consumeSesion(subscriptionId)

    // Incrementar reservas en el slot
    workshop.slots[slotIndex].reservas += 1
    await workshop.save()

    // Crear booking
    const booking = await new Booking({
      subscriptionId,
      workshopId,
      studentId,
      slotIndex,
      fecha: slot.fecha ?? new Date(),
      estado: 'reservada',
    }).save()

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

    // Decrementar reservas en el slot
    if (workshop) {
      const slot = workshop.slots[booking.slotIndex]
      if (slot) {
        slot.reservas = Math.max(0, slot.reservas - 1)
        await workshop.save()
      }
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
    if (newSlot.reservas >= workshop.cupoPorSesion) throw new Error('Sesión destino sin cupo')

    // Liberar cupo del slot anterior
    const oldSlot = workshop.slots[booking.slotIndex]
    if (oldSlot) oldSlot.reservas = Math.max(0, oldSlot.reservas - 1)

    // Ocupar cupo del nuevo slot
    newSlot.reservas += 1
    await workshop.save()

    // Actualizar booking
    booking.slotIndex = newSlotIndex
    booking.fecha = newSlot.fecha ?? new Date()
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
