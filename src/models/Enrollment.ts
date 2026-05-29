import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IEnrollment extends Document {
  workshopId: Types.ObjectId;
  studentId: Types.ObjectId;
  slotIndex: number | null;
  estado: 'pendiente' | 'pagado' | 'cancelado';
  pagoRef?: string;
  monto: number;
  creditoAplicado: number;
  esClasePrueba: boolean;
  montoPagadoVoluntario?: number;
  // Inscripción manual
  dependentId?: Types.ObjectId;
  dependentNombreSnapshot?: string;
  origenInscripcion: 'checkout' | 'manual';
  inscritoPor?: Types.ObjectId;
  notaTallerista?: string;
  asistio?: boolean | null;  // null = sin marcar, true = asistió, false = no asistió
  activo: boolean;
  reviewEmailEnviadoEn?: Date;
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
  // Inscripción manual
  dependentId:           { type: Schema.Types.ObjectId },
  dependentNombreSnapshot: { type: String, maxlength: 100 },
  origenInscripcion:     { type: String, enum: ['checkout', 'manual'], default: 'checkout' },
  inscritoPor:           { type: Schema.Types.ObjectId, ref: 'User' },
  notaTallerista:        { type: String, maxlength: 500 },
  activo:          { type: Boolean, default: true },
  asistio:         { type: Boolean, default: null },
  reviewEmailEnviadoEn: { type: Date },
}, { timestamps: true });

// Validación: inscripción manual requiere inscritoPor + coherencia dependentId/snapshot
EnrollmentSchema.pre('save', function (next) {
  if (this.origenInscripcion === 'manual' && !this.inscritoPor) {
    return next(new Error('[MANUAL] inscritoPor es obligatorio para origenInscripcion manual'))
  }
  if (this.dependentId && !this.dependentNombreSnapshot) {
    return next(new Error('[MANUAL] dependentNombreSnapshot es obligatorio cuando dependentId está presente'))
  }
  next()
});

EnrollmentSchema.index({ workshopId: 1 });
EnrollmentSchema.index({ studentId: 1 });
// Bloquea duplicados solo para enrollments activos (pendiente/pagado).
// dependentId incluido para permitir apoderado inscribiendo a varios hijos en el mismo slot.
EnrollmentSchema.index(
  { workshopId: 1, studentId: 1, slotIndex: 1, dependentId: 1 },
  { unique: true, partialFilterExpression: { estado: { $in: ['pendiente', 'pagado'] } } }
);
// 1 clase de prueba por (alumno, dependiente) por taller
EnrollmentSchema.index(
  { workshopId: 1, studentId: 1, dependentId: 1, esClasePrueba: 1 },
  { unique: true, partialFilterExpression: { esClasePrueba: true, estado: { $in: ['pendiente', 'pagado'] } } }
);

export default mongoose.models.Enrollment || mongoose.model<IEnrollment>('Enrollment', EnrollmentSchema);
