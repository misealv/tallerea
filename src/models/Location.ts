import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILocation extends Document {
  accountId: Types.ObjectId;
  nombre: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  region?: string;
  coordenadas?: {
    lat: number;
    lng: number;
  };
  activo: boolean;
  createdAt: Date;
}

const LocationSchema = new Schema<ILocation>({
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  nombre: { type: String, required: true, trim: true },
  direccion: { type: String, required: true, trim: true },
  comuna: { type: String, required: true, trim: true },
  ciudad: { type: String, required: true, trim: true },
  region: { type: String, trim: true },
  coordenadas: {
    lat: { type: Number },
    lng: { type: Number },
  },
  activo: { type: Boolean, default: true },
}, { timestamps: true });

LocationSchema.index({ accountId: 1 });
LocationSchema.index({ comuna: 1 });
LocationSchema.index({ ciudad: 1 });

export default mongoose.models.Location || mongoose.model<ILocation>('Location', LocationSchema);
