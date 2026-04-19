import mongoose, { Schema, Document, Types } from 'mongoose';

export type AuditAction =
  | 'pago_recibido'
  | 'liquidacion_creada'
  | 'liquidacion_pagada'
  | 'reembolso'
  | 'ajuste';

export interface IFinanceAuditLog extends Document {
  accion: AuditAction;
  entidadTipo: 'PaymentBreakdown' | 'Liquidation';
  entidadId: Types.ObjectId;
  montoAnterior: number;
  montoNuevo: number;
  userId: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const FinanceAuditLogSchema = new Schema<IFinanceAuditLog>({
  accion: {
    type: String,
    enum: ['pago_recibido', 'liquidacion_creada', 'liquidacion_pagada', 'reembolso', 'ajuste'],
    required: true,
  },
  entidadTipo: { type: String, enum: ['PaymentBreakdown', 'Liquidation'], required: true },
  entidadId: { type: Schema.Types.ObjectId, required: true },
  montoAnterior: { type: Number, required: true, default: 0 },
  montoNuevo: { type: Number, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

FinanceAuditLogSchema.index({ entidadTipo: 1, entidadId: 1 });
FinanceAuditLogSchema.index({ accion: 1 });
FinanceAuditLogSchema.index({ createdAt: 1 });

export default mongoose.models.FinanceAuditLog || mongoose.model<IFinanceAuditLog>('FinanceAuditLog', FinanceAuditLogSchema);
