import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IReagendamiento {
  solicitadoEn: Date;
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  slotDestinoIndex?: number;
  decididoEn?: Date;
  razonRechazo?: string;
}

export interface IBooking extends Document {
  subscriptionId: Types.ObjectId;
  workshopId: Types.ObjectId;
  studentId: Types.ObjectId;
  slotIndex: number;
  fecha: Date;
  estado: 'reservada' | 'asistio' | 'no_asistio' | 'cancelada';
  canceladaEn: Date | null;
  canceladaRazon?: 'alumno_dentro_plazo' | 'alumno_fuera_plazo' | 'tallerista' | 'ciclo_vencido' | null;
  reagendamiento?: IReagendamiento;
  // Dependiente (heredado de Subscription al crear el Booking)
  dependentId?: Types.ObjectId;
  dependentNombreSnapshot?: string;
  // Quien generó la reserva: el alumno (default) o el tallerista a nombre del alumno
  reservadoPor: 'alumno' | 'tallerista';
  activo: boolean;
  createdAt: Date;
}

const ReagendamientoSchema = new Schema<IReagendamiento>({
  solicitadoEn: { type: Date, required: true },
  estado: { type: String, enum: ['pendiente', 'aprobado', 'rechazado'], default: 'pendiente' },
  slotDestinoIndex: { type: Number },
  decididoEn: { type: Date },
  razonRechazo: { type: String },
}, { _id: false });

const BookingSchema = new Schema<IBooking>({
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true },
  workshopId: { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  slotIndex: { type: Number, required: true, min: 0 },
  fecha: { type: Date, required: true },
  estado: { type: String, enum: ['reservada', 'asistio', 'no_asistio', 'cancelada'], default: 'reservada' },
  canceladaEn: { type: Date, default: null },
  canceladaRazon: {
    type: String,
    enum: ['alumno_dentro_plazo', 'alumno_fuera_plazo', 'tallerista', 'ciclo_vencido', null],
    default: null,
  },
  reagendamiento: { type: ReagendamientoSchema },
  // Dependiente — copiado desde Subscription al momento de crear el Booking
  dependentId:             { type: Schema.Types.ObjectId },
  dependentNombreSnapshot: { type: String, maxlength: 100 },
  reservadoPor: { type: String, enum: ['alumno', 'tallerista'], default: 'alumno' },
  activo: { type: Boolean, default: true },
}, { timestamps: true });

// Validación: si hay dependentId, debe haber snapshot
BookingSchema.pre('save', function (next) {
  if (this.dependentId && !this.dependentNombreSnapshot) {
    return next(new Error('[MANUAL] dependentNombreSnapshot es obligatorio cuando dependentId está presente'))
  }
  next()
});

BookingSchema.index({ workshopId: 1, fecha: 1 });
BookingSchema.index({ studentId: 1, fecha: 1 });
BookingSchema.index({ subscriptionId: 1 });

// 1 reserva por (alumno, dependiente) por sesión.
// dependentId incluido para permitir apoderado reservando para varios hijos en el mismo slot.
BookingSchema.index(
  { workshopId: 1, studentId: 1, slotIndex: 1, dependentId: 1 },
  { unique: true, partialFilterExpression: { estado: { $in: ['reservada', 'asistio', 'no_asistio'] } } }
);

export default mongoose.models.Booking || mongoose.model<IBooking>('Booking', BookingSchema);
