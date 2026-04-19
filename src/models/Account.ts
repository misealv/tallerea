import mongoose, { Schema, Document, Types } from 'mongoose';

const TIPOS_ENUM = [
  'visual', 'teatro', 'danza', 'musica', 'ceramica', 'yoga',
  'cocina', 'manualidades', 'fotografia', 'escritura', 'bienestar',
  'tecnologia', 'idiomas', 'infantil', 'otro'
] as const;

export interface IDatosBancarios {
  banco: string;
  tipoCuenta: 'corriente' | 'vista' | 'ahorro' | 'rut';
  numeroCuenta: string;
  rutTitular: string;
  nombreTitular: string;
  emailPagos: string;
}

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
  // Financiero
  datosBancarios?: IDatosBancarios;
  precioModalidad: 'neto' | 'bruto';
  liquidacionMinima: number;
  enPeriodoPrueba: boolean;
  fechaInicioPrueba?: Date;
  activo: boolean;
  createdAt: Date;
}

const DatosBancariosSchema = new Schema({
  banco: { type: String, required: true },
  tipoCuenta: { type: String, enum: ['corriente', 'vista', 'ahorro', 'rut'], required: true },
  numeroCuenta: { type: String, required: true },
  rutTitular: { type: String, required: true },
  nombreTitular: { type: String, required: true },
  emailPagos: { type: String, required: true },
}, { _id: false });

const AccountSchema = new Schema<IAccount>({
  tipo: { type: String, enum: ['individual', 'institucion'], required: true },
  nombre: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  bio: { type: String, default: '' },
  especialidades: [{ type: String, enum: TIPOS_ENUM }],
  logo: { type: String },
  redesSociales: {
    instagram: { type: String },
    web: { type: String },
    facebook: { type: String },
  },
  verificado: { type: Boolean, default: false },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  // Financiero
  datosBancarios: { type: DatosBancariosSchema },
  precioModalidad: { type: String, enum: ['neto', 'bruto'], default: 'bruto' },
  liquidacionMinima: { type: Number, default: 5000, min: 0 },
  enPeriodoPrueba: { type: Boolean, default: true },
  fechaInicioPrueba: { type: Date, default: Date.now },
  activo: { type: Boolean, default: true },
}, { timestamps: true });

// slug index already created by unique: true on field definition
AccountSchema.index({ ownerId: 1 });
AccountSchema.index({ especialidades: 1 });
AccountSchema.index({ verificado: 1 });

export default mongoose.models.Account || mongoose.model<IAccount>('Account', AccountSchema);
