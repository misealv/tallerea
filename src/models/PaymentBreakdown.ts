import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPaymentBreakdown extends Document {
  subscriptionId?: Types.ObjectId;
  enrollmentId?: Types.ObjectId;
  workshopId: Types.ObjectId;
  accountId: Types.ObjectId;  // legacy
  ownerId?: Types.ObjectId;   // User tallerista directo
  studentId: Types.ObjectId;
  // Montos en enteros CLP ($25.000 = 25000)
  montoBruto: number;
  comisionMP: number;
  feeTallerea: number;
  montoProfesor: number;
  creditoAplicado: number;  // crédito del alumno usado en el checkout (informativo; no entra en la cuadratura)
  // Porcentajes
  porcentajeFee: number;
  precioModalidad: 'neto' | 'bruto';
  // Tipo
  tipo: 'pago' | 'reembolso' | 'ajuste';
  // Estado
  estado: 'pendiente' | 'cobrado' | 'liquidado' | 'reembolsado';
  mercadoPagoId?: string;
  fechaCobro?: Date;
  liquidationId?: Types.ObjectId;
  createdAt: Date;
}

const PaymentBreakdownSchema = new Schema<IPaymentBreakdown>({
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
  enrollmentId: { type: Schema.Types.ObjectId, ref: 'Enrollment' },
  workshopId: { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  // Montos — enteros CLP
  montoBruto: { type: Number, required: true },
  comisionMP: { type: Number, required: true, default: 0, min: 0 },
  feeTallerea: { type: Number, required: true, min: 0 },
  montoProfesor: { type: Number, required: true, min: 0 },
  creditoAplicado: { type: Number, required: true, default: 0, min: 0 },
  // Porcentajes
  porcentajeFee: { type: Number, required: true, min: 0, max: 100 },
  precioModalidad: { type: String, enum: ['neto', 'bruto'], required: true },
  // Tipo
  tipo: { type: String, enum: ['pago', 'reembolso', 'ajuste'], default: 'pago' },
  // Estado
  estado: { type: String, enum: ['pendiente', 'cobrado', 'liquidado', 'reembolsado'], default: 'pendiente' },
  mercadoPagoId: { type: String },
  fechaCobro: { type: Date },
  liquidationId: { type: Schema.Types.ObjectId, ref: 'Liquidation' },
}, { timestamps: true });

// [CUADRATURA] Verificar ecuación fundamental antes de guardar
PaymentBreakdownSchema.pre('save', function(next) {
  // Validar enteros positivos (reembolsos pueden tener montos negativos)
  if (this.tipo === 'pago') {
    if (!Number.isInteger(this.montoBruto) || this.montoBruto <= 0) {
      return next(new Error('[FINANCE ERROR] montoBruto debe ser entero positivo'));
    }
    if (!Number.isInteger(this.feeTallerea) || this.feeTallerea < 0) {
      return next(new Error('[FINANCE ERROR] feeTallerea debe ser entero no negativo'));
    }
    if (!Number.isInteger(this.montoProfesor) || this.montoProfesor < 0) {
      return next(new Error('[FINANCE ERROR] montoProfesor debe ser entero no negativo'));
    }
  }
  // Cuadratura: montoBruto === montoProfesor + feeTallerea
  if (this.montoBruto !== this.montoProfesor + this.feeTallerea) {
    return next(new Error(
      `[FINANCE ERROR] Cuadratura fallida: ${this.montoBruto} ≠ ${this.montoProfesor} + ${this.feeTallerea}`
    ));
  }
  next();
});

PaymentBreakdownSchema.index({ workshopId: 1 });
PaymentBreakdownSchema.index({ accountId: 1, estado: 1 });
PaymentBreakdownSchema.index({ studentId: 1 });
PaymentBreakdownSchema.index({ liquidationId: 1 });
PaymentBreakdownSchema.index({ estado: 1, fechaCobro: 1 });

export default mongoose.models.PaymentBreakdown || mongoose.model<IPaymentBreakdown>('PaymentBreakdown', PaymentBreakdownSchema);
