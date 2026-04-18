import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: 'alumno' | 'admin';
  phone?: string;
  image?: string;
  activo: boolean;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['alumno', 'admin'], default: 'alumno' },
  phone: { type: String, trim: true },
  image: { type: String },
  activo: { type: Boolean, default: true },
}, { timestamps: true });

UserSchema.index({ email: 1 });

export default mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
