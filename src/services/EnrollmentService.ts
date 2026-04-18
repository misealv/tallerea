import mongoose from 'mongoose'
import dbConnect from '@/lib/db'
import Enrollment, { IEnrollment } from '@/models/Enrollment'
import Workshop from '@/models/Workshop'
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

  async create(data: { workshopId: string; studentId: string; monto: number }): Promise<IEnrollment> {
    await dbConnect()

    // Verificar cupo disponible antes de inscribir
    const workshop = await Workshop.findOne({ _id: data.workshopId, activo: true })
    if (!workshop) throw new Error('Taller no encontrado')
    if (workshop.cupoDisponible <= 0) throw new Error('No hay cupos disponibles')

    // Verificar inscripción duplicada
    const existing = await Enrollment.findOne({
      workshopId: data.workshopId,
      studentId: data.studentId,
      activo: true,
      estado: { $ne: 'cancelado' }
    })
    if (existing) throw new Error('Ya estás inscrito en este taller')

    // Transacción: crear enrollment + decrementar cupo
    const session = await mongoose.startSession()
    session.startTransaction()
    try {
      const [enrollment] = await Enrollment.create([{
        ...data,
        estado: 'pendiente',
        activo: true,
      }], { session })

      await Workshop.findByIdAndUpdate(
        data.workshopId,
        { $inc: { cupoDisponible: -1 } },
        { session }
      )

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
      await Workshop.findByIdAndUpdate(
        enrollment.workshopId,
        { $inc: { cupoDisponible: 1 } },
        { session }
      )
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
