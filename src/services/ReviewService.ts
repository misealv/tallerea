import 'server-only'
import mongoose from 'mongoose'
import dbConnect from '@/lib/db'
import Review, { IReview } from '@/models/Review'
import Workshop from '@/models/Workshop'
import Enrollment from '@/models/Enrollment'
import Subscription from '@/models/Subscription'
import Booking from '@/models/Booking'
import { ReviewCreateInput } from '@/schemas/review'

// Tipo mínimo que necesitamos del workshop en queries de elegibilidad
interface WorkshopLean {
  _id: mongoose.Types.ObjectId
  titulo: string
  slug: string
  imagenes: string[]
  ownerId?: mongoose.Types.ObjectId
  slots?: { fecha?: Date }[]
}

// Mapa interno: workshopId → origen de elegibilidad (para trazabilidad)
type OrigenMap = Map<string, { enrollmentId?: mongoose.Types.ObjectId; subscriptionId?: mongoose.Types.ObjectId }>

interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export const ReviewService = {

  // Devuelve reviews publicados de todos los talleres de un espacio (para perfil público)
  async getByAccount(
    workshopIds: string[],
    limit = 10
  ): Promise<IReview[]> {
    await dbConnect()
    const ids = workshopIds.map(id => new mongoose.Types.ObjectId(id))
    return Review.find({ workshopId: { $in: ids }, publicado: true, activo: true })
      .populate('studentId', 'name')
      .populate('workshopId', 'titulo slug')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<IReview[]>()
  },

  // Devuelve reviews publicados de un taller (para página pública)
  async getByWorkshop(
    workshopId: string,
    page = 1,
    limit = 20
  ): Promise<PaginatedResult<IReview>> {
    await dbConnect()
    const query = { workshopId, publicado: true, activo: true }
    const [data, total] = await Promise.all([
      Review.find(query)
        .populate('studentId', 'name image')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<IReview[]>(),
      Review.countDocuments(query),
    ])
    return { data, total, page, limit }
  },

  // Devuelve workshops donde el alumno puede dejar review (aún no lo hizo)
  async getElegibles(studentId: string): Promise<WorkshopLean[]> {
    await dbConnect()

    const now = new Date()
    const sid = new mongoose.Types.ObjectId(studentId)

    // IDs de workshops ya revieweados por este alumno
    const yaRevieweados = await Review.find(
      { studentId: sid, activo: true },
      { workshopId: 1 }
    ).lean<{ workshopId: mongoose.Types.ObjectId }[]>()
    const excluidos = yaRevieweados.map(r => r.workshopId)

    // --- Canal 1: Enrollments pagados con slot.fecha pasada ---
    // Populate incluye `slots` → evita N+1
    type EnrollmentLean = {
      _id: mongoose.Types.ObjectId
      slotIndex: number | null
      workshopId: WorkshopLean | null
    }
    const enrollments = await Enrollment.find({
      studentId: sid,
      estado: 'pagado',
      activo: true,
      esClasePrueba: { $ne: true },   // [PREGUNTA 2] La prueba NO otorga elegibilidad de review
    })
      .populate('workshopId', 'titulo slug imagenes ownerId slots')
      .lean<EnrollmentLean[]>()

    const elegibles: WorkshopLean[] = []
    const origen: OrigenMap = new Map()

    for (const e of enrollments) {
      const w = e.workshopId
      if (!w?._id) continue
      if (excluidos.some(id => id.equals(w._id))) continue
      const slotIndex = e.slotIndex ?? 0
      const slotFecha = w.slots?.[slotIndex]?.fecha
      if (slotFecha && new Date(slotFecha) < now) {
        elegibles.push(w)
        origen.set(String(w._id), { enrollmentId: e._id })
      }
    }

    // --- Canal 2: Subscriptions con ≥30 días y al menos 1 booking asistio ---
    const umbraldias = new Date(now)
    umbraldias.setDate(umbraldias.getDate() - 30)

    type SubscriptionLean = {
      _id: mongoose.Types.ObjectId
      workshopId: WorkshopLean | null
    }
    const subscriptions = await Subscription.find({
      studentId: sid,
      activo: true,
      createdAt: { $lte: umbraldias },
    })
      .populate('workshopId', 'titulo slug imagenes ownerId')
      .lean<SubscriptionLean[]>()

    for (const s of subscriptions) {
      const w = s.workshopId
      if (!w?._id) continue
      if (excluidos.some(id => id.equals(w._id))) continue
      if (elegibles.some(we => we._id.equals(w._id))) continue

      const tieneBookingAsistida = await Booking.exists({
        subscriptionId: s._id,
        studentId: sid,
        estado: 'asistio',
        activo: true,
      })
      if (tieneBookingAsistida) {
        elegibles.push(w)
        origen.set(String(w._id), { subscriptionId: s._id })
      }
    }

    // Adjuntar origen como propiedad no enumerable para que `create` lo use
    ;(elegibles as unknown as { _origen?: OrigenMap })._origen = origen
    return elegibles
  },

  // Crea un review. Valida elegibilidad, unicidad, y actualiza métricas.
  async create(
    studentId: string,
    data: ReviewCreateInput
  ): Promise<IReview> {
    await dbConnect()

    const sid = new mongoose.Types.ObjectId(studentId)
    const wid = new mongoose.Types.ObjectId(data.workshopId)

    // Verificar elegibilidad
    const elegibles = await this.getElegibles(studentId)
    const esElegible = elegibles.some(w => w._id.equals(wid))
    if (!esElegible) {
      throw new Error('No cumples los requisitos para dejar un review en este taller')
    }

    // Origen (enrollment o subscription) para trazabilidad
    const origen = (elegibles as unknown as { _origen?: OrigenMap })._origen?.get(String(wid)) ?? {}

    // Obtener ownerId del workshop
    const workshop = await Workshop.findById(wid).select('ownerId').lean<{
      _id: mongoose.Types.ObjectId
      ownerId?: mongoose.Types.ObjectId
    }>()
    if (!workshop) throw new Error('Taller no encontrado')

    const ownerId = workshop.ownerId
    if (!ownerId) throw new Error('El taller no tiene propietario asignado')

    const review = await new Review({
      workshopId:     wid,
      studentId:      sid,
      ownerId,
      rating:         data.rating,
      comentario:     data.comentario,
      enrollmentId:   origen.enrollmentId,
      subscriptionId: origen.subscriptionId,
      publicado:      true,
    }).save()

    // Actualizar métricas denormalizadas del workshop
    await this._recalcWorkshop(String(wid))

    // Actualizar métricas denormalizadas en User.taller (si el owner es User directo)
    if (workshop.ownerId) {
      await this._recalcOwner(String(workshop.ownerId))
    }

    return review
  },

  // Moderar un review (admin)
  async moderar(reviewId: string, publicado: boolean): Promise<IReview | null> {
    await dbConnect()
    const review = await Review.findOneAndUpdate(
      { _id: reviewId, activo: true },
      { publicado },
      { new: true }
    ).lean<IReview>()

    if (review) {
      await this._recalcWorkshop(String(review.workshopId))
      if (review.ownerId) await this._recalcOwner(String(review.ownerId))
    }
    return review
  },

  // Soft delete
  async delete(reviewId: string): Promise<void> {
    await dbConnect()
    const review = await Review.findByIdAndUpdate(reviewId, { activo: false }).lean<IReview>()
    if (review) {
      await this._recalcWorkshop(String(review.workshopId))
      if (review.ownerId) await this._recalcOwner(String(review.ownerId))
    }
  },

  // Recalcula reviewsCount/reviewsAvg en el Workshop
  async _recalcWorkshop(workshopId: string): Promise<void> {
    const agg = await Review.aggregate<{ count: number; avg: number }>([
      { $match: { workshopId: new mongoose.Types.ObjectId(workshopId), publicado: true, activo: true } },
      { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$rating' } } },
    ])
    const { count = 0, avg = 0 } = agg[0] ?? {}
    await Workshop.findByIdAndUpdate(workshopId, {
      reviewsCount: count,
      reviewsAvg:   Math.round(avg * 10) / 10, // 1 decimal
    })
  },

  // Recalcula reviewsCount/reviewsAvg en User.taller (tallerista)
  async _recalcOwner(ownerId: string): Promise<void> {
    const agg = await Review.aggregate<{ count: number; avg: number }>([
      { $match: { ownerId: new mongoose.Types.ObjectId(ownerId), publicado: true, activo: true } },
      { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$rating' } } },
    ])
    const { count = 0, avg = 0 } = agg[0] ?? {}
    // Solo actualiza si el User tiene subdocumento taller
    const { default: User } = await import('@/models/User')
    await User.findOneAndUpdate(
      { _id: ownerId, 'taller': { $exists: true } },
      { $set: { 'taller.reviewsCount': count, 'taller.reviewsAvg': Math.round(avg * 10) / 10 } }
    )
  },
}
