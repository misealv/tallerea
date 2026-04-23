import mongoose, { Schema, Types } from 'mongoose'

export interface ICreditTransaction {
  _id: Types.ObjectId
  userId: Types.ObjectId
  tipo: 'otorgado' | 'usado' | 'caducado' | 'ajuste'
  monto: number            // positivo si otorgado/ajuste+, negativo si usado
  saldoResultante: number  // snapshot de creditoDisponible tras el movimiento
  origen: {
    tipo: 'reembolso' | 'compensacion' | 'admin' | 'checkout'
    enrollmentId?: Types.ObjectId
    subscriptionId?: Types.ObjectId
    adminId?: Types.ObjectId
  }
  motivo: string
  createdAt: Date
}

const CreditTransactionSchema = new Schema<ICreditTransaction>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tipo: {
    type: String,
    enum: ['otorgado', 'usado', 'caducado', 'ajuste'],
    required: true,
  },
  monto: { type: Number, required: true },    // CLP enteros; signed
  saldoResultante: { type: Number, required: true, min: 0 },
  origen: {
    tipo: {
      type: String,
      enum: ['reembolso', 'compensacion', 'admin', 'checkout'],
      required: true,
    },
    enrollmentId:   { type: Schema.Types.ObjectId, ref: 'Enrollment' },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
    adminId:        { type: Schema.Types.ObjectId, ref: 'User' },
  },
  motivo: { type: String, required: true, maxlength: 500 },
}, { timestamps: { createdAt: true, updatedAt: false } })  // append-only — sin updatedAt

// Índices de consulta
CreditTransactionSchema.index({ userId: 1, createdAt: -1 })
CreditTransactionSchema.index({ 'origen.enrollmentId': 1 }, { sparse: true })

export default mongoose.models.CreditTransaction ||
  mongoose.model<ICreditTransaction>('CreditTransaction', CreditTransactionSchema)
