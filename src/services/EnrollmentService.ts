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
      .populate('workshopId', 'titulo slug tipo precio')
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
    const existing = await Enrollment.findOne({
      workshopId: data.workshopId,
      studentId: data.studentId,
      slotIndex,
      activo: true,
      estado: { $ne: 'cancelado' }
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
        await Workshop.findByIdAndUpdate(
          enrollment.workshopId,
          { $inc: { [`slots.${enrollment.slotIndex}.cupoDisponible`]: 1 } },
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
}
