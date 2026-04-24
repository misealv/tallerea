import mongoose, { Schema, Document, Types } from 'mongoose';

const TIPOS_ENUM = [
  'visual', 'teatro', 'danza', 'musica', 'ceramica', 'yoga',
  'cocina', 'manualidades', 'fotografia', 'escritura', 'bienestar',
  'tecnologia', 'idiomas', 'infantil', 'otro'
] as const;

export const WORKSHOP_TIPOS = TIPOS_ENUM;
export type TipoTaller = typeof TIPOS_ENUM[number];

export interface ISlot {
  dia?: string;               // opcional en nuevos slots con fecha concreta
  horaInicio: string;
  horaFin: string;
  fecha?: Date;
  cupoDisponible?: number;    // campo unificado de cupo por slot
  reservas: number;
  cancelado: boolean;
  // Campos legacy
  cupoMax?: number;
}

export interface IPlan {
  sesionesIncluidas: number;
  vigencia: 'mensual' | 'por_ciclo' | 'sin_vencimiento';
  precioSesionSuelta: number | null;
  horasAntesCancelacion: number;
  permitirCambioPostPlazo: boolean;
  politicaNoShow: 'pierde' | 'reagendar_una_vez';
}

export interface IPlantillaSemanal {
  dia: string;
  horaInicio: string;
  horaFin: string;
}

export interface IPlantillaMensual {
  tipoDia: 'fijo' | 'posicion';
  diaFijo?: number;
  posicion?: 'primero' | 'segundo' | 'tercero' | 'cuarto' | 'ultimo';
  diaSemana?: string;
  horaInicio: string;
  horaFin: string;
}

export interface IPolitica {
  horasAntesCancelacion: number;
  permitirReagendamiento: boolean;
}

export type ModalidadPrecio = 'gratuito' | 'fijo' | 'voluntario' | 'paquetes';

export interface IPrecioFijo {
  monto: number;
}

export interface IAporteVoluntario {
  sugerido: number;
  minimo: number;
  maximo: number | null;
}

export interface IPaquete {
  _id: Types.ObjectId;
  nombre: string;
  precio: number;
  sesionesIncluidas: number;
  duracionDias: number;
  activo: boolean;
  orden: number;
}

export interface IClasePrueba {
  habilitada: boolean;
  precio: number;        // 0 = gratuita, >0 = reducida
  limitePorAlumno: 1;   // fijo en V1
}

export interface IWorkshop extends Document {
  accountId?: Types.ObjectId;  // legacy — se mantiene para compatibilidad con datos existentes
  ownerId: Types.ObjectId;     // User tallerista directo
  locationId?: Types.ObjectId;
  instructorId?: Types.ObjectId;  // legacy
  slug: string;
  titulo: string;
  descripcion: string;
  tipo: TipoTaller;
  tipoPersonalizado?: string | null;
  modalidad: 'presencial' | 'online' | 'hibrido';
  precio: number;
  duracionSesion: number;
  // --- Recurrencia ---
  tipoRecurrencia: 'unico' | 'semanal' | 'mensual';
  recurrencia?: {
    cantidadRepeticiones: number | null;
    fechaFinRecurrencia: Date | null;
  };
  // --- Capacidad ---
  cupoPorSesion: number;
  maxAlumnosActivos: number | null;
  // --- Plan ---
  plan?: IPlan;
  precioModalidad: 'neto' | 'bruto';
  modeloAcceso: 'puntual' | 'recurrente';
  politica: IPolitica;
  // --- Plantillas ---
  plantillaSemanal?: IPlantillaSemanal[];
  plantillaMensual?: IPlantillaMensual;
  // --- Legacy ---
  cupoDefault: number;
  cupoMax: number;
  cupoDisponible: number;
  // --- Slots ---
  slots: ISlot[];
  fechaInicio: Date;
  fechaFin?: Date;
  edadMinima?: number;
  edadMaxima?: number;
  imagenes: string[];
  activo: boolean;
  deletedAt: Date | null;
  // Métricas denormalizadas de reviews
  reviewsCount: number;
  reviewsAvg: number;
  // Modelo de precios (v2)
  modalidadPrecio: ModalidadPrecio;
  precioFijo?: IPrecioFijo;
  aporteVoluntario?: IAporteVoluntario;
  paquetes?: IPaquete[];
  clasePrueba?: IClasePrueba;
  createdAt: Date;
}

const DIAS_ENUM = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

const SlotSchema = new Schema({
  dia: { type: String, enum: DIAS_ENUM },   // opcional en slots con fecha concreta
  horaInicio: { type: String, required: true },
  horaFin: { type: String, required: true },
  fecha: { type: Date },
  reservas: { type: Number, default: 0, min: 0 },
  cancelado: { type: Boolean, default: false },
  // Legacy
  cupoMax: { type: Number, min: 1 },
  cupoDisponible: { type: Number, min: 0 },
}, { _id: false });

const PlanSchema = new Schema({
  sesionesIncluidas: { type: Number, required: true, min: 1 },
  vigencia: { type: String, enum: ['mensual', 'por_ciclo', 'sin_vencimiento'], required: true },
  precioSesionSuelta: { type: Number, default: null, min: 0 },
  horasAntesCancelacion: { type: Number, default: 24, min: 0 },
  permitirCambioPostPlazo: { type: Boolean, default: false },
  politicaNoShow: { type: String, enum: ['pierde', 'reagendar_una_vez'], default: 'pierde' },
}, { _id: false });

const PlantillaSemanalSchema = new Schema({
  dia: { type: String, enum: DIAS_ENUM, required: true },
  horaInicio: { type: String, required: true },
  horaFin: { type: String, required: true },
}, { _id: false });

const PlantillaMensualSchema = new Schema({
  tipoDia: { type: String, enum: ['fijo', 'posicion'], required: true },
  diaFijo: { type: Number, min: 1, max: 31 },
  posicion: { type: String, enum: ['primero', 'segundo', 'tercero', 'cuarto', 'ultimo'] },
  diaSemana: { type: String, enum: DIAS_ENUM },
  horaInicio: { type: String, required: true },
  horaFin: { type: String, required: true },
}, { _id: false });

const PoliticaSchema = new Schema({
  horasAntesCancelacion: { type: Number, default: 24, min: 0 },
  permitirReagendamiento: { type: Boolean, default: true },
}, { _id: false });

const PrecioFijoSchema = new Schema({
  monto: { type: Number, required: true, min: 0 },
}, { _id: false });

const AporteVoluntarioSchema = new Schema({
  sugerido: { type: Number, required: true, min: 0 },
  minimo:   { type: Number, default: 0, min: 0 },
  maximo:   { type: Number, default: null },
}, { _id: false });

const PaqueteSchema = new Schema({
  nombre:            { type: String, required: true, trim: true },
  precio:            { type: Number, required: true, min: 0 },
  sesionesIncluidas: { type: Number, required: true, min: 1 },
  duracionDias:      { type: Number, required: true, min: 1 },
  activo:            { type: Boolean, default: true },
  orden:             { type: Number, default: 0 },
});

const ClasePruebaSchema = new Schema({
  habilitada:       { type: Boolean, default: false },
  precio:           { type: Number, default: 0, min: 0 },
  limitePorAlumno:  { type: Number, default: 1, enum: [1] },
}, { _id: false });

const WorkshopSchema = new Schema<IWorkshop>({
  // accountId e instructorId mantenidos como campos opcionales sin ref para compat con datos legacy
  // (Account y AccountMember fueron eliminados en Fase 11)
  accountId: { type: Schema.Types.ObjectId },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location' },
  instructorId: { type: Schema.Types.ObjectId },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  titulo: { type: String, required: true, trim: true },
  descripcion: { type: String, required: true },
  tipo: { type: String, enum: TIPOS_ENUM, required: true },
  tipoPersonalizado: { type: String, trim: true, maxlength: 50, default: null },
  modalidad: { type: String, enum: ['presencial', 'online', 'hibrido'], required: true },
  precio: { type: Number, required: true, min: 0 },
  duracionSesion: { type: Number, default: 90, min: 30, max: 240 },
  // Recurrencia
  tipoRecurrencia: { type: String, enum: ['unico', 'semanal', 'mensual'], default: 'unico' },
  recurrencia: {
    cantidadRepeticiones: { type: Number, default: null },
    fechaFinRecurrencia: { type: Date, default: null },
  },
  // Capacidad
  cupoPorSesion: { type: Number, default: 10, min: 1 },
  maxAlumnosActivos: { type: Number, default: null },
  // Plan
  plan: { type: PlanSchema },
  precioModalidad: { type: String, enum: ['neto', 'bruto'], default: 'bruto' },
  modeloAcceso: { type: String, enum: ['puntual', 'recurrente'] },
  politica: { type: PoliticaSchema, default: () => ({ horasAntesCancelacion: 24, permitirReagendamiento: true }) },
  // Plantillas
  plantillaSemanal: [PlantillaSemanalSchema],
  plantillaMensual: { type: PlantillaMensualSchema },
  // Legacy
  cupoDefault: { type: Number, default: 10, min: 1 },
  cupoMax: { type: Number, default: 1, min: 1 },
  cupoDisponible: { type: Number, default: 1, min: 0 },
  // Slots + fechas
  slots: [SlotSchema],
  fechaInicio: { type: Date, required: true },
  fechaFin: { type: Date },
  edadMinima: { type: Number },
  edadMaxima: { type: Number },
  imagenes: [{ type: String }],
  activo: { type: Boolean, default: true },
  deletedAt: { type: Date, default: null },
  reviewsCount: { type: Number, default: 0 },
  reviewsAvg:   { type: Number, default: 0 },
  // Modelo de precios v2 — reemplaza el campo `precio` global
  modalidadPrecio: {
    type: String,
    enum: ['gratuito', 'fijo', 'voluntario', 'paquetes'],
    default: 'fijo',
  },
  precioFijo:        { type: PrecioFijoSchema },
  aporteVoluntario:  { type: AporteVoluntarioSchema },
  paquetes:          [PaqueteSchema],
  clasePrueba:       { type: ClasePruebaSchema },
}, { timestamps: true });

WorkshopSchema.pre('save', function(next) {
  // Validar que exista ownerId
  if (!this.ownerId && !this.accountId) {
    return next(new Error('[WORKSHOP] Debe especificar ownerId'));
  }
  // tipoPersonalizado solo se guarda si tipo === 'otro'
  if (this.tipo !== 'otro') {
    this.tipoPersonalizado = null;
  }
  // Inferir modalidadPrecio desde precio legacy si no está definido (compat migración)
  if (!this.modalidadPrecio) {
    this.modalidadPrecio = this.precio === 0 ? 'gratuito'
      : this.plan ? 'paquetes'
      : 'fijo';
  }
  // Inferir modeloAcceso si no está definido (compat con docs existentes)
  if (!this.modeloAcceso) {
    this.modeloAcceso = (this.plan || this.modalidadPrecio === 'paquetes') ? 'recurrente' : 'puntual';
  }

  // [BREAKING] Validar coherencia modalidadPrecio ↔ modeloAcceso
  if (this.modeloAcceso === 'puntual' && this.modalidadPrecio === 'paquetes') {
    return next(new Error('[WORKSHOP] Taller puntual no puede usar modalidad "paquetes"'));
  }
  if (this.modeloAcceso === 'recurrente' && !['gratuito', 'paquetes'].includes(this.modalidadPrecio)) {
    return next(new Error('[WORKSHOP] Taller recurrente solo permite modalidad "gratuito" o "paquetes"'));
  }

  // Validar coherencia interna de modalidadPrecio
  const mp = this.modalidadPrecio;
  if (mp === 'fijo') {
    if (!this.precioFijo || this.precioFijo.monto < 0) {
      return next(new Error('[WORKSHOP] Modalidad "fijo" requiere precioFijo.monto >= 0'));
    }
  }
  if (mp === 'voluntario') {
    const av = this.aporteVoluntario;
    if (!av) return next(new Error('[WORKSHOP] Modalidad "voluntario" requiere aporteVoluntario'));
    if (av.sugerido < av.minimo) return next(new Error('[WORKSHOP] aporteVoluntario.sugerido debe ser >= minimo'));
    if (av.maximo !== null && av.maximo !== undefined && av.maximo < av.sugerido) {
      return next(new Error('[WORKSHOP] aporteVoluntario.maximo debe ser >= sugerido'));
    }
  }
  if (mp === 'paquetes') {
    const pqs = this.paquetes ?? [];
    if (pqs.length === 0) return next(new Error('[WORKSHOP] Modalidad "paquetes" requiere al menos un paquete'));
    if (!pqs.some(p => p.activo)) return next(new Error('[WORKSHOP] Debe haber al menos un paquete activo'));
    for (const p of pqs) {
      if (p.precio < 0) return next(new Error('[WORKSHOP] Precio de paquete no puede ser negativo'));
      if (p.sesionesIncluidas < 1) return next(new Error('[WORKSHOP] sesionesPorPeriodo debe ser >= 1'));
    }
  }
  if (this.clasePrueba?.habilitada && this.clasePrueba.precio < 0) {
    return next(new Error('[WORKSHOP] clasePrueba.precio no puede ser negativo'));
  }

  // Compat: modeloAcceso recurrente requiere plan (legacy) o paquetes
  if (this.modeloAcceso === 'recurrente' && !this.plan && (this.paquetes ?? []).length === 0) {
    return next(new Error('[WORKSHOP] Taller recurrente requiere "plan" o al menos un "paquete" definido'));
  }
  if (this.modeloAcceso === 'puntual' && this.plan) {
    this.plan = undefined;
  }
  next();
});

// slug index already created by unique: true on field definition
WorkshopSchema.index({ ownerId: 1, activo: 1 });
WorkshopSchema.index({ tipo: 1 });
WorkshopSchema.index({ modalidad: 1 });
WorkshopSchema.index({ modeloAcceso: 1, activo: 1 });
WorkshopSchema.index({ activo: 1 });
WorkshopSchema.index({ precio: 1 });
WorkshopSchema.index({ 'slots.dia': 1 });
WorkshopSchema.index({ 'slots.fecha': 1 });

export default mongoose.models.Workshop || mongoose.model<IWorkshop>('Workshop', WorkshopSchema);
