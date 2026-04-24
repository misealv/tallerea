import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISubscription extends Document {
  workshopId: Types.ObjectId;
  studentId: Types.ObjectId;
  estado: 'activa' | 'vencida' | 'cancelada';
  sesionesTotales: number;
  sesionesUsadas: number;
  sesionesDisponibles: number;
  fechaCompra: Date;
  fechaVencimiento: Date;
  pagoRef: string;
  paymentBreakdownId?: Types.ObjectId;
  monto: number;
  autoRenovar: boolean;
  renovadaDesdeId?: Types.ObjectId;
  // Snapshot del paquete al momento de comprar (inmutable post-creación)
  paqueteId?: Types.ObjectId;
  paqueteNombreSnapshot?: string;
  precioSnapshot?: number;
  sesionesPorPeriodoSnapshot?: number;
  activo: boolean;
  createdAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>({
  workshopId: { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  estado: { type: String, enum: ['activa', 'vencida', 'cancelada'], default: 'activa' },
  sesionesTotales: { type: Number, required: true, min: 1 },
  sesionesUsadas: { type: Number, default: 0, min: 0 },
  sesionesDisponibles: { type: Number, required: true, min: 0 },
  fechaCompra: { type: Date, default: Date.now },
  fechaVencimiento: { type: Date, required: true },
  pagoRef: { type: String },
  paymentBreakdownId: { type: Schema.Types.ObjectId, ref: 'PaymentBreakdown' },
  monto: { type: Number, required: true, min: 0 },
  autoRenovar: { type: Boolean, default: true },
  renovadaDesdeId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
  // Snapshot de paquete — inmutable post-creación
  paqueteId:                 { type: Schema.Types.ObjectId },
  paqueteNombreSnapshot:     { type: String },
  precioSnapshot:            { type: Number, min: 0 },
  sesionesPorPeriodoSnapshot:{ type: Number, min: 1 },
  activo: { type: Boolean, default: true },
}, { timestamps: true });

SubscriptionSchema.index({ workshopId: 1, studentId: 1, estado: 1 });
SubscriptionSchema.index({ studentId: 1, estado: 1 });
SubscriptionSchema.index({ fechaVencimiento: 1 });

// Solo 1 suscripción activa por alumno por taller
SubscriptionSchema.index(
  { workshopId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { estado: 'activa' } }
);

// [IDEMPOTENCIA] pagoRef único cuando está presente — evita duplicar Subscription por retries del webhook MP
SubscriptionSchema.index(
  { pagoRef: 1 },
  { unique: true, sparse: true }
);

export default mongoose.models.Subscription || mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
