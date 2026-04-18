import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAccount extends Document {
  tipo: 'individual' | 'institucion';
  nombre: string;
  slug: string;
  bio: string;
  especialidades: string[];
  logo?: string;
  redesSociales?: {
    instagram?: string;
    web?: string;
    facebook?: string;
  };
  verificado: boolean;
  ownerId: Types.ObjectId;
  activo: boolean;
  createdAt: Date;
}

const AccountSchema = new Schema<IAccount>({
  tipo: { type: String, enum: ['individual', 'institucion'], required: true },
  nombre: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  bio: { type: String, default: '' },
  especialidades: [{ type: String, enum: ['visual', 'teatro', 'danza', 'musica', 'otro'] }],
  logo: { type: String },
  redesSociales: {
    instagram: { type: String },
    web: { type: String },
    facebook: { type: String },
  },
  verificado: { type: Boolean, default: false },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  activo: { type: Boolean, default: true },
}, { timestamps: true });

// slug index already created by unique: true on field definition
AccountSchema.index({ ownerId: 1 });
AccountSchema.index({ especialidades: 1 });
AccountSchema.index({ verificado: 1 });

export default mongoose.models.Account || mongoose.model<IAccount>('Account', AccountSchema);
