import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IEnrollment extends Document {
  workshopId: Types.ObjectId;
  studentId: Types.ObjectId;
  slotIndex: number | null;
  estado: 'pendiente' | 'pagado' | 'cancelado';
  pagoRef?: string;
  monto: number;
  creditoAplicado: number;  // CLP descontados del saldo del alumno (default 0)
  activo: boolean;
  createdAt: Date;
}

const EnrollmentSchema = new Schema<IEnrollment>({
  workshopId:  { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
  studentId:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  slotIndex:   { type: Number, default: null },
  estado:      { type: String, enum: ['pendiente', 'pagado', 'cancelado'], default: 'pendiente' },
  pagoRef:     { type: String },
  monto:       { type: Number, required: true, min: 0 },
  creditoAplicado: { type: Number, default: 0, min: 0 },
  activo:      { type: Boolean, default: true },
}, { timestamps: true });

EnrollmentSchema.index({ workshopId: 1 });
EnrollmentSchema.index({ studentId: 1 });
// Unique por workshop + student + slotIndex (permite múltiples slots del mismo taller)
EnrollmentSchema.index({ workshopId: 1, studentId: 1, slotIndex: 1 }, { unique: true });

export default mongoose.models.Enrollment || mongoose.model<IEnrollment>('Enrollment', EnrollmentSchema);
