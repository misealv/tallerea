import 'server-only'
import mongoose, { Schema, Types } from 'mongoose'

export interface IManualPaymentRecord {
  ownerId: Types.ObjectId          // tallerista que registró el pago
  studentId: Types.ObjectId        // titular (apoderado o alumno mismo)
  dependentId?: Types.ObjectId     // si el pago es por un dependiente
  workshopId: Types.ObjectId
  enrollmentId?: Types.ObjectId
  subscriptionId?: Types.ObjectId
  monto: number                    // CLP enteros — declarativo, sin comisiones
  metodoPago: 'transferencia' | 'efectivo' | 'otro'
  fecha: Date                      // fecha en que se realizó el pago por fuera
  comprobanteUrl?: string          // URL Cloudinary (imagen o PDF)
  notas?: string
}

export interface IManualPaymentRecordDoc extends IManualPaymentRecord {
  _id: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const ManualPaymentRecordSchema = new Schema<IManualPaymentRecord>(
  {
    ownerId:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
    studentId:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dependentId:    { type: Schema.Types.ObjectId },
    workshopId:     { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
    enrollmentId:   { type: Schema.Types.ObjectId, ref: 'Enrollment' },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
    monto:          { type: Number, required: true, min: 0 },
    metodoPago:     { type: String, enum: ['transferencia', 'efectivo', 'otro'], required: true },
    fecha:          { type: Date, required: true },
    comprobanteUrl: { type: String },
    notas:          { type: String, maxlength: 500 },
  },
  { timestamps: true }
)

// Índices para queries del panel del tallerista
ManualPaymentRecordSchema.index({ ownerId: 1, fecha: -1 })
ManualPaymentRecordSchema.index({ workshopId: 1, studentId: 1 })

export default mongoose.models.ManualPaymentRecord ??
  mongoose.model<IManualPaymentRecord>('ManualPaymentRecord', ManualPaymentRecordSchema)
