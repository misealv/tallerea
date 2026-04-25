import mongoose from 'mongoose'
import dbConnect from '@/lib/db'
import Enrollment, { IEnrollment } from '@/models/Enrollment'
import Workshop from '@/models/Workshop'
import { CreditService } from '@/services/CreditService'
import '@/models/User'

interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export const EnrollmentService = {

  async getAll(filters?: Record<string, unknown>, page = 1, limit = 20): Promise<PaginatedResult<IEnrollment>> {
    await dbConnect()
    const query = { activo: true, ...filters }
    const [data, total] = await Promise.all([
      Enrollment.find(query)
        .select('-pagoRef')
        .populate('workshopId', 'titulo slug tipo')
        .populate('studentId', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<IEnrollment[]>(),
      Enrollment.countDocuments(query)
    ])
    return { data, total, page, limit }
  },

  async getById(id: string): Promise<IEnrollment | null> {
    await dbConnect()
    return Enrollment.findOne({ _id: id, activo: true })
      .populate('workshopId', 'titulo slug tipo precio ownerId precioModalidad')
      .populate('studentId', 'name email phone')
      .lean<IEnrollment>()
  },

  async getByStudentId(studentId: string, page = 1, limit = 20): Promise<PaginatedResult<IEnrollment>> {
    return this.getAll({ studentId }, page, limit)
  },

  async getByWorkshopId(workshopId: string, page = 1, limit = 20): Promise<PaginatedResult<IEnrollment>> {
    return this.getAll({ workshopId }, page, limit)
  },

  async create(data: { workshopId: string; studentId: string; monto: number; slotIndex?: number | null; usarCredito?: boolean }): Promise<IEnrollment> {
    await dbConnect()

    const slotIndex = data.slotIndex ?? null

    // Liberar cupos de carritos abandonados (>5 min en estado 'pendiente') antes de validar
    await this._sweepStalePendingForSlot(data.workshopId, slotIndex)

    const workshop = await Workshop.findOne({ _id: data.workshopId, activo: true })
    if (!workshop) throw new Error('Taller no encontrado')

    // Verificar cupo según si tiene slots o no
    if (workshop.slots && workshop.slots.length > 0) {
      if (slotIndex === null || slotIndex < 0 || slotIndex >= workshop.slots.length) {
        throw new Error('Debes seleccionar un horario válido')
      }
      if (workshop.slots[slotIndex].cupoDisponible <= 0) {
        throw new Error('No hay cupos disponibles en este horario')
      }
    } else {
      if (workshop.cupoDisponible <= 0) throw new Error('No hay cupos disponibles')
    }

    // Verificar inscripción duplicada (mismo taller + mismo slot)
    // Los 'pendiente' de más de 60 min se consideran abandonados y no bloquean.
    // 60min absorbe latencia de pagos diferidos (transferencia, OXXO) sin cancelar prematuramente.
    const cutoff = new Date(Date.now() - 60 * 60 * 1000)
    const existing = await Enrollment.findOne({
      workshopId: data.workshopId,
      studentId: data.studentId,
      slotIndex,
      activo: true,
      $or: [
        { estado: 'pagado' },
        { estado: 'pendiente', createdAt: { $gte: cutoff } },
      ],
    })
    if (existing) throw new Error('Ya estás inscrito en este horario')

    // Transacción: crear enrollment + decrementar cupo + opcionalmente usar crédito
    const session = await mongoose.startSession()
    session.startTransaction()
    try {
      // [FINANCE RISK] Usar crédito si el alumno lo solicitó
      let creditoAplicado = 0
      if (data.usarCredito && data.monto > 0) {
        const resultado = await CreditService.usar({
          userId:    data.studentId,
          monto:     data.monto,
          motivo:    `Checkout taller ${data.workshopId}`,
          session,
        })
        creditoAplicado = resultado.montoUsado
      }

      const [enrollment] = await Enrollment.create([{
        workshopId:      data.workshopId,
        studentId:       data.studentId,
        slotIndex,
        monto:           data.monto,
        creditoAplicado,
        estado:          'pendiente',
        activo:          true,
      }], { session })

      if (workshop.slots && workshop.slots.length > 0 && slotIndex !== null) {
        await Workshop.findByIdAndUpdate(
          data.workshopId,
          { $inc: { [`slots.${slotIndex}.cupoDisponible`]: -1 } },
          { session }
        )
      } else {
        await Workshop.findByIdAndUpdate(
          data.workshopId,
          { $inc: { cupoDisponible: -1 } },
          { session }
        )
      }

      // Al cancelar un enrollment con crédito aplicado, devolvemos el crédito al alumno
      // (manejado en EnrollmentService.cancel)
      enrollment.set('creditoAplicado', creditoAplicado)

      await session.commitTransaction()
      return enrollment
    } catch (error) {
      await session.abortTransaction()
      throw error
    } finally {
      session.endSession()
    }
  },

  async update(id: string, data: Partial<IEnrollment>): Promise<IEnrollment | null> {
    await dbConnect()
    const doc = await Enrollment.findOneAndUpdate(
      { _id: id, activo: true },
      data,
      { new: true, runValidators: true }
    )
    if (!doc) throw new Error(`Enrollment ${id} no encontrado`)
    return doc
  },

  async cancel(id: string): Promise<void> {
    await dbConnect()
    const enrollment = await Enrollment.findOne({ _id: id, activo: true })
    if (!enrollment) throw new Error('Inscripción no encontrada')
    if (enrollment.estado === 'cancelado') throw new Error('Ya está cancelada')

    const session = await mongoose.startSession()
    session.startTransaction()
    try {
      await Enrollment.findByIdAndUpdate(id, { estado: 'cancelado' }, { session })

      const workshop = await Workshop.findById(enrollment.workshopId)
      if (workshop && workshop.slots && workshop.slots.length > 0 && enrollment.slotIndex !== null) {
        const slot = workshop.slots[enrollment.slotIndex]
        // Liberar el campo correcto según estructura del slot:
        // - Puntual legacy: incrementar cupoDisponible
        // - Recurrente: decrementar reservas (el cupo es cupoPorSesion - reservas)
        const incOp = slot && slot.cupoDisponible !== undefined
          ? { [`slots.${enrollment.slotIndex}.cupoDisponible`]: 1 }
          : { [`slots.${enrollment.slotIndex}.reservas`]: -1 }
        await Workshop.findByIdAndUpdate(
          enrollment.workshopId,
          { $inc: incOp },
          { session }
        )
      } else {
        await Workshop.findByIdAndUpdate(
          enrollment.workshopId,
          { $inc: { cupoDisponible: 1 } },
          { session }
        )
      }

      // [FINANCE RISK] Devolver crédito si se había aplicado en el checkout
      // Pasamos la session del cancel a otorgar para mantener atomicidad.
      if (enrollment.creditoAplicado > 0) {
        await CreditService.otorgar({
          userId:       String(enrollment.studentId),
          monto:        enrollment.creditoAplicado,
          origenTipo:   'reembolso',
          enrollmentId: String(enrollment._id),
          motivo:       `Devolución de crédito por cancelación de inscripción`,
          session,
        })
      }

      await session.commitTransaction()
    } catch (error) {
      await session.abortTransaction()
      throw error
    } finally {
      session.endSession()
    }
  },

  async delete(id: string): Promise<void> {
    await dbConnect()
    await Enrollment.findByIdAndUpdate(id, { activo: false })
  },

  /**
   * Reserva la clase de prueba (1 por alumno por taller).
   * Si precio === 0 → crea enrollment pagado directo.
   * Si precio > 0 → crea enrollment pendiente para que PaymentService complete el pago.
   */
  /**
   * Barre enrollments 'pendiente' con createdAt > 5 min en el slot dado y libera su cupo.
   * Lazy cleanup: se ejecuta al intentar reservar para que otros usuarios vean cupo liberado
   * de carritos abandonados sin esperar un cron. Idempotente.
   */
  async _sweepStalePendingForSlot(workshopId: string, slotIndex: number | null): Promise<void> {
    await dbConnect()
    // Cutoff a 60min para no cancelar pagos diferidos en proceso
    const cutoff = new Date(Date.now() - 60 * 60 * 1000)
    const stale = await Enrollment.find({
      workshopId,
      slotIndex: slotIndex ?? null,
      estado: 'pendiente',
      activo: true,
      createdAt: { $lt: cutoff },
    }).select('_id studentId creditoAplicado').lean<{ _id: mongoose.Types.ObjectId; studentId: mongoose.Types.ObjectId; creditoAplicado: number }[]>()

    if (stale.length === 0) return

    const workshop = await Workshop.findById(workshopId).select('slots').lean<{ slots?: { cupoDisponible?: number }[] }>()
    const slot = workshop?.slots && slotIndex !== null ? workshop.slots[slotIndex] : undefined
    const slotHasCupoField = !!slot && slot.cupoDisponible !== undefined

    for (const e of stale) {
      // Transición atómica de pendiente → cancelado: solo el ganador libera cupo y crédito.
      const updated = await Enrollment.updateOne(
        { _id: e._id, estado: 'pendiente' },
        { estado: 'cancelado' }
      )
      if (updated.modifiedCount === 0) continue

      if (slotIndex !== null && workshop?.slots && workshop.slots.length > 0) {
        const incOp = slotHasCupoField
          ? { [`slots.${slotIndex}.cupoDisponible`]: 1 }
          : { [`slots.${slotIndex}.reservas`]: -1 }
        await Workshop.updateOne({ _id: workshopId }, { $inc: incOp })
      } else {
        await Workshop.updateOne({ _id: workshopId }, { $inc: { cupoDisponible: 1 } })
      }

      if (e.creditoAplicado > 0) {
        await CreditService.otorgar({
          userId: String(e.studentId),
          monto: e.creditoAplicado,
          origenTipo: 'reembolso',
          enrollmentId: String(e._id),
          motivo: 'Devolución de crédito por abandono de checkout (>5 min)',
        }).catch(() => null)
      }
    }
  },

  async reservarPrueba(
    workshopId: string,
    studentId: string,
    slotIndex: number | null,
  ): Promise<IEnrollment> {
    await dbConnect()

    // Liberar cupos de carritos abandonados antes de validar disponibilidad
    await this._sweepStalePendingForSlot(workshopId, slotIndex)

    const workshop = await Workshop.findOne({ _id: workshopId, activo: true })
    if (!workshop) throw new Error('Taller no encontrado')
    if (!workshop.clasePrueba?.habilitada) throw new Error('Este taller no ofrece clase de prueba')

    // [PREGUNTA 2] Validar 1 prueba por alumno por taller (excluye canceladas)
    const yaTuvo = await Enrollment.countDocuments({
      workshopId,
      studentId,
      esClasePrueba: true,
      estado: { $ne: 'cancelado' },
    })
    if (yaTuvo > 0) throw new Error('Ya usaste tu clase de prueba en este taller')

    const precio = workshop.clasePrueba.precio ?? 0

    // [PREGUNTA 4][RACE] La clase de prueba consume el mismo cupo del slot regular (aforo).
    // Decremento atómico condicional para evitar overbooking.
    const session = await mongoose.startSession()
    session.startTransaction()
    try {
      if (workshop.slots && workshop.slots.length > 0 && slotIndex !== null) {
        if (slotIndex < 0 || slotIndex >= workshop.slots.length) {
          throw new Error('Debes seleccionar un horario válido')
        }
        const slot = workshop.slots[slotIndex]

        // [RACE] Dos estrategias atómicas según el modelo del taller:
        // - Legacy puntual: slot tiene cupoDisponible propio → decrementar ese campo
        // - Recurrente: slot tiene reservas + workshop.cupoPorSesion → incrementar reservas si reservas < cupoPorSesion
        let updated
        if (slot.cupoDisponible !== undefined) {
          // Puntual legacy
          updated = await Workshop.updateOne(
            { _id: workshopId, [`slots.${slotIndex}.cupoDisponible`]: { $gt: 0 } },
            { $inc: { [`slots.${slotIndex}.cupoDisponible`]: -1 } },
            { session }
          )
        } else {
          // Recurrente: guard atómico via $expr para comparar reservas vs cupoPorSesion del mismo documento
          updated = await Workshop.updateOne(
            {
              _id: workshopId,
              $expr: {
                $lt: [
                  { $arrayElemAt: ['$slots.reservas', slotIndex] },
                  '$cupoPorSesion',
                ],
              },
            },
            { $inc: { [`slots.${slotIndex}.reservas`]: 1 } },
            { session }
          )
        }
        if (updated.modifiedCount === 0) throw new Error('No hay cupos disponibles en este horario')
      } else {
        const updated = await Workshop.updateOne(
          { _id: workshopId, cupoDisponible: { $gt: 0 } },
          { $inc: { cupoDisponible: -1 } },
          { session }
        )
        if (updated.modifiedCount === 0) throw new Error('No hay cupos disponibles')
      }

      const [enrollment] = await Enrollment.create([{
        workshopId,
        studentId,
        slotIndex,
        monto: precio,
        creditoAplicado: 0,
        esClasePrueba: true,
        estado: precio === 0 ? 'pagado' : 'pendiente',
        activo: true,
      }], { session })

      await session.commitTransaction()
      return enrollment
    } catch (error) {
      await session.abortTransaction()
      throw error
    } finally {
      session.endSession()
    }
  },
}
