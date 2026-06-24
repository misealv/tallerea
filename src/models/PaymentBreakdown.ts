import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPaymentBreakdown extends Document {
  subscriptionId?: Types.ObjectId;
  enrollmentId?: Types.ObjectId;
  workshopId: Types.ObjectId;
  ownerId: Types.ObjectId;    // User tallerista directo
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
  // [INMUTABLE] Solo en breakdowns tipo:'reembolso': apunta al breakdown original reembolsado
  referenciaOriginalId?: Types.ObjectId;
  createdAt: Date;
}

const PaymentBreakdownSchema = new Schema<IPaymentBreakdown>({
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
  enrollmentId: { type: Schema.Types.ObjectId, ref: 'Enrollment' },
  workshopId: { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  // Montos — enteros CLP
  montoBruto: { type: Number, required: true },
  comisionMP: { type: Number, required: true, default: 0 },
  // [INMUTABLE] min:0 eliminado aquí; los reembolsos usan montos negativos.
  // La validación de no-negativo para tipo:'pago' se aplica en el pre-save hook.
  feeTallerea: { type: Number, required: true },
  montoProfesor: { type: Number, required: true },
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
  // [INMUTABLE] Solo en tipo:'reembolso': referencia al breakdown original; fuente de verdad para detección de doble reembolso
  referenciaOriginalId: { type: Schema.Types.ObjectId, ref: 'PaymentBreakdown' },
}, { timestamps: true });

// [CUADRATURA] Verificar ecuación fundamental antes de guardar
PaymentBreakdownSchema.pre('save', function(this: IPaymentBreakdown, next) {
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
PaymentBreakdownSchema.index({ ownerId: 1, estado: 1 });
PaymentBreakdownSchema.index({ studentId: 1 });
PaymentBreakdownSchema.index({ liquidationId: 1 });
PaymentBreakdownSchema.index({ estado: 1, fechaCobro: 1 });
// [INMUTABLE] Índice sparse para lookup de reembolso por breakdown original (detectar doble reembolso)
PaymentBreakdownSchema.index({ referenciaOriginalId: 1 }, { sparse: true });
// [IDEMPOTENCIA] Garantiza que un mismo pago de MP no se registre dos veces.
// Sparse: permite ajustes/reembolsos manuales sin mercadoPagoId.
PaymentBreakdownSchema.index(
  { mercadoPagoId: 1 },
  { unique: true, sparse: true, name: 'mercadoPagoId_unique_sparse' }
);

export default mongoose.models.PaymentBreakdown || mongoose.model<IPaymentBreakdown>('PaymentBreakdown', PaymentBreakdownSchema);
