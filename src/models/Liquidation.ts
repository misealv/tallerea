import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILiquidation extends Document {
  accountId: Types.ObjectId;  // legacy
  ownerId?: Types.ObjectId;   // User tallerista directo
  periodo: {
    desde: Date;
    hasta: Date;
  };
  breakdowns: Types.ObjectId[];
  totalBruto: number;
  totalFeeTallerea: number;
  totalProfesor: number;
  cantidadPagos: number;
  // Cuadratura: totalBruto === totalProfesor + totalFeeTallerea
  estado: 'pendiente' | 'procesando' | 'pagada' | 'error';
  metodoDeposito: 'csv_bancario' | 'fintoc' | 'manual';
  comprobanteUrl?: string;
  fechaPago?: Date;
  notas?: string;
  createdAt: Date;
}

const LiquidationSchema = new Schema<ILiquidation>({
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
  periodo: {
    desde: { type: Date, required: true },
    hasta: { type: Date, required: true },
  },
  breakdowns: [{ type: Schema.Types.ObjectId, ref: 'PaymentBreakdown' }],
  totalBruto: { type: Number, required: true },
  totalFeeTallerea: { type: Number, required: true },
  totalProfesor: { type: Number, required: true },
  cantidadPagos: { type: Number, required: true, min: 0 },
  estado: { type: String, enum: ['pendiente', 'procesando', 'pagada', 'error'], default: 'pendiente' },
  metodoDeposito: { type: String, enum: ['csv_bancario', 'fintoc', 'manual'], default: 'csv_bancario' },
  comprobanteUrl: { type: String },
  fechaPago: { type: Date },
  notas: { type: String },
}, { timestamps: true });

// [CUADRATURA] Verificar ecuación fundamental antes de guardar
LiquidationSchema.pre('save', function(next) {
  if (this.totalBruto !== this.totalProfesor + this.totalFeeTallerea) {
    return next(new Error(
      `[FINANCE ERROR] Cuadratura de liquidación fallida: ${this.totalBruto} ≠ ${this.totalProfesor} + ${this.totalFeeTallerea}`
    ));
  }
  next();
});

LiquidationSchema.index({ accountId: 1, estado: 1 });
LiquidationSchema.index({ ownerId: 1, estado: 1 });
LiquidationSchema.index({ 'periodo.desde': 1, 'periodo.hasta': 1 });

export default mongoose.models.Liquidation || mongoose.model<ILiquidation>('Liquidation', LiquidationSchema);
