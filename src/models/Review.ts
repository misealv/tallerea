import mongoose, { Schema, Document, Types } from 'mongoose'

export interface IReview extends Document {
  workshopId: Types.ObjectId
  studentId: Types.ObjectId
  ownerId: Types.ObjectId        // denormalizado del workshop (para query rápida en perfil)
  rating: number                 // 1-5 entero
  comentario: string             // ≤ 1000 chars
  // Trazabilidad — qué compra habilitó el review
  enrollmentId?: Types.ObjectId
  subscriptionId?: Types.ObjectId
  publicado: boolean             // admin puede ocultar por moderación
  activo: boolean
  createdAt: Date
  updatedAt: Date
}

const ReviewSchema = new Schema<IReview>({
  workshopId:     { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
  studentId:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
  ownerId:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  rating:         { type: Number, required: true, min: 1, max: 5 },
  comentario:     { type: String, required: true, maxlength: 1000, trim: true },
  enrollmentId:   { type: Schema.Types.ObjectId, ref: 'Enrollment' },
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
  publicado:      { type: Boolean, default: true },
  activo:         { type: Boolean, default: true },
}, { timestamps: true })

// Un review por (workshopId, studentId)
ReviewSchema.index(
  { workshopId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { activo: true } }
)
ReviewSchema.index({ workshopId: 1, publicado: 1 })
ReviewSchema.index({ ownerId: 1, publicado: 1 })

export default mongoose.models.Review || mongoose.model<IReview>('Review', ReviewSchema)
