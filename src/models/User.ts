import mongoose, { Schema, Types } from 'mongoose'

export interface IDatosBancarios {
  banco: string
  tipoCuenta: 'corriente' | 'vista' | 'ahorro' | 'rut'
  numeroCuenta: string
  rutTitular: string
  nombreTitular: string
  emailPagos: string
}

export interface ITallerHistorial {
  accion: 'solicitud' | 'aprobacion' | 'rechazo' | 'suspension' | 'reactivacion' | 're_postulacion'
  fecha: Date
  adminId?: Types.ObjectId
  razon?: string
  snapshotPerfil?: { bio: string; credenciales: string }
}

export interface ITaller {
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'suspendido'
  slug: string
  bio: string
  formacion: string
  credenciales: string
  documentosCredenciales: string[]
  especialidades: string[]
  entregaMateriales: string
  logo?: string
  redesSociales?: { instagram?: string; web?: string; facebook?: string }
  datosBancarios?: IDatosBancarios
  liquidacionMinima: number
  reviewsCount: number
  reviewsAvg: number
  historial: ITallerHistorial[]
  intentos: number
  ultimaSolicitudEn?: Date
  ultimoRechazoEn?: Date
  suspensionesCount: number
}

export interface IUser {
  _id: Types.ObjectId
  name: string
  email: string
  password?: string
  phone?: string
  image?: string
  role: 'user' | 'admin'
  taller?: ITaller
  creditoDisponible: number
  magicLinkToken?: string
  magicLinkExpiresAt?: Date
  activo: boolean
  createdAt: Date
  updatedAt: Date
}

// -- Sub-schemas --

const DatosBancariosSchema = new Schema({
  banco: { type: String, required: true },
  tipoCuenta: { type: String, enum: ['corriente', 'vista', 'ahorro', 'rut'], required: true },
  numeroCuenta: { type: String, required: true },
  rutTitular: { type: String, required: true },
  nombreTitular: { type: String, required: true },
  emailPagos: { type: String, required: true },
}, { _id: false })

const TallerHistorialSchema = new Schema({
  accion: {
    type: String,
    enum: ['solicitud', 'aprobacion', 'rechazo', 'suspension', 'reactivacion', 're_postulacion'],
    required: true,
  },
  fecha: { type: Date, required: true },
  adminId: { type: Schema.Types.ObjectId, ref: 'User' },
  razon: { type: String },
  snapshotPerfil: {
    bio: { type: String },
    credenciales: { type: String },
  },
}, { _id: false })

const TallerSchema = new Schema({
  estado: {
    type: String,
    enum: ['pendiente', 'aprobado', 'rechazado', 'suspendido'],
    required: true,
  },
  slug: { type: String, required: true },
  bio: { type: String, default: '', maxlength: 2000 },
  formacion: { type: String, default: '', maxlength: 2000 },
  credenciales: { type: String, default: '', maxlength: 2000 },
  documentosCredenciales: [{ type: String }],
  especialidades: [{ type: String }],
  entregaMateriales: { type: String, default: '', maxlength: 500 },
  logo: { type: String },
  redesSociales: {
    instagram: { type: String },
    web: { type: String },
    facebook: { type: String },
  },
  datosBancarios: DatosBancariosSchema,
  liquidacionMinima: { type: Number, default: 5000 },
  reviewsCount: { type: Number, default: 0 },
  reviewsAvg: { type: Number, default: 0 },
  historial: [TallerHistorialSchema],
  intentos: { type: Number, default: 0 },
  ultimaSolicitudEn: { type: Date },
  ultimoRechazoEn: { type: Date },
  suspensionesCount: { type: Number, default: 0 },
}, { _id: false })

// -- User schema --

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, select: false },
  phone: { type: String, trim: true },
  image: { type: String },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  taller: TallerSchema,
  creditoDisponible: { type: Number, default: 0 },
  magicLinkToken: { type: String, select: false },
  magicLinkExpiresAt: { type: Date, select: false },
  activo: { type: Boolean, default: true },
}, { timestamps: true })

UserSchema.index({ email: 1 })
UserSchema.index({ 'taller.slug': 1 }, { unique: true, sparse: true })
UserSchema.index({ 'taller.estado': 1 }, { sparse: true })
UserSchema.index({ role: 1 })

export default mongoose.models.User || mongoose.model<IUser>('User', UserSchema)
