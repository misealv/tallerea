import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IEnrollment extends Document {
  workshopId: Types.ObjectId;
  studentId: Types.ObjectId;
  slotIndex: number | null;
  estado: 'pendiente' | 'pagado' | 'cancelado';
  pagoRef?: string;
  monto: number;
  creditoAplicado: number;
  esClasePrueba: boolean;             // true = clase de prueba
  montoPagadoVoluntario?: number;     // solo si workshop.modalidadPrecio === 'voluntario'
  activo: boolean;
  createdAt: Date;
}

const EnrollmentSchema = new Schema<IEnrollment>({
  workshopId:  { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
  studentId:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  slotIndex:   { type: Number, default: null },
  estado:      { type: String, enum: ['pendiente', 'pagado', 'cancelado'], default: 'pendiente' },
  pagoRef:     { type: String },
  monto:           { type: Number, required: true, min: 0 },
  creditoAplicado: { type: Number, default: 0, min: 0 },
  esClasePrueba:   { type: Boolean, default: false },
  montoPagadoVoluntario: { type: Number, min: 0 },
  activo:          { type: Boolean, default: true },
}, { timestamps: true });

EnrollmentSchema.index({ workshopId: 1 });
EnrollmentSchema.index({ studentId: 1 });
// Bloquea duplicados solo para enrollments activos (pendiente/pagado)
EnrollmentSchema.index(
  { workshopId: 1, studentId: 1, slotIndex: 1 },
  { unique: true, partialFilterExpression: { estado: { $in: ['pendiente', 'pagado'] } } }
);
// 1 clase de prueba por alumno por taller
EnrollmentSchema.index(
  { workshopId: 1, studentId: 1, esClasePrueba: 1 },
  { unique: true, sparse: true, partialFilterExpression: { esClasePrueba: true, estado: { $ne: 'cancelado' } } }
);

export default mongoose.models.Enrollment || mongoose.model<IEnrollment>('Enrollment', EnrollmentSchema);
