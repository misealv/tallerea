import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWorkshop extends Document {
  accountId: Types.ObjectId;
  locationId?: Types.ObjectId;
  instructorId?: Types.ObjectId;
  slug: string;
  titulo: string;
  descripcion: string;
  tipo: 'visual' | 'teatro' | 'danza' | 'musica' | 'otro';
  modalidad: 'presencial' | 'online' | 'hibrido';
  precio: number;
  cupoMax: number;
  cupoDisponible: number;
  horarios: {
    dia: string;
    horaInicio: string;
    horaFin: string;
  }[];
  fechaInicio: Date;
  fechaFin?: Date;
  edadMinima?: number;
  edadMaxima?: number;
  imagenes: string[];
  activo: boolean;
  createdAt: Date;
}

const WorkshopSchema = new Schema<IWorkshop>({
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location' },
  instructorId: { type: Schema.Types.ObjectId, ref: 'AccountMember' },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  titulo: { type: String, required: true, trim: true },
  descripcion: { type: String, required: true },
  tipo: { type: String, enum: ['visual', 'teatro', 'danza', 'musica', 'otro'], required: true },
  modalidad: { type: String, enum: ['presencial', 'online', 'hibrido'], required: true },
  precio: { type: Number, required: true, min: 0 },
  cupoMax: { type: Number, required: true, min: 1 },
  cupoDisponible: { type: Number, required: true, min: 0 },
  horarios: [{
    dia: { type: String, enum: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'], required: true },
    horaInicio: { type: String, required: true },
    horaFin: { type: String, required: true },
  }],
  fechaInicio: { type: Date, required: true },
  fechaFin: { type: Date },
  edadMinima: { type: Number },
  edadMaxima: { type: Number },
  imagenes: [{ type: String }],
  activo: { type: Boolean, default: true },
}, { timestamps: true });

WorkshopSchema.index({ slug: 1 });
WorkshopSchema.index({ accountId: 1 });
WorkshopSchema.index({ tipo: 1 });
WorkshopSchema.index({ modalidad: 1 });
WorkshopSchema.index({ activo: 1 });
WorkshopSchema.index({ precio: 1 });
WorkshopSchema.index({ 'horarios.dia': 1 });

export default mongoose.models.Workshop || mongoose.model<IWorkshop>('Workshop', WorkshopSchema);
