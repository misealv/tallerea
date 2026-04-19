import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IBooking extends Document {
  subscriptionId: Types.ObjectId;
  workshopId: Types.ObjectId;
  studentId: Types.ObjectId;
  slotIndex: number;
  fecha: Date;
  estado: 'reservada' | 'asistio' | 'no_asistio' | 'cancelada';
  canceladaEn: Date | null;
  activo: boolean;
  createdAt: Date;
}

const BookingSchema = new Schema<IBooking>({
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true },
  workshopId: { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  slotIndex: { type: Number, required: true, min: 0 },
  fecha: { type: Date, required: true },
  estado: { type: String, enum: ['reservada', 'asistio', 'no_asistio', 'cancelada'], default: 'reservada' },
  canceladaEn: { type: Date, default: null },
  activo: { type: Boolean, default: true },
}, { timestamps: true });

BookingSchema.index({ workshopId: 1, fecha: 1 });
BookingSchema.index({ studentId: 1, fecha: 1 });
BookingSchema.index({ subscriptionId: 1 });

// 1 reserva por alumno por sesión
BookingSchema.index(
  { workshopId: 1, studentId: 1, slotIndex: 1 },
  { unique: true, partialFilterExpression: { estado: { $ne: 'cancelada' } } }
);

export default mongoose.models.Booking || mongoose.model<IBooking>('Booking', BookingSchema);
