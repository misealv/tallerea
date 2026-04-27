import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IClasesPrepagadas {
  cantidad: number;
  consumidas: number;
  fechaPago: Date;
  metodoPago: 'transferencia' | 'efectivo' | 'otro';
  montoDeclarado?: number;
  notaTallerista?: string;
  creadoPor: Types.ObjectId;
  caducaEn?: Date;  // fecha hasta la que son válidas las clases prepagadas
}

export interface ISubscription extends Document {
  workshopId: Types.ObjectId;
  studentId: Types.ObjectId;
  estado: 'pendiente_pago' | 'activa' | 'vencida' | 'cancelada';
  sesionesTotales: number;
  sesionesUsadas: number;
  sesionesDisponibles: number;
  fechaCompra: Date;
  fechaVencimiento: Date;
  pagoRef: string;
  paymentBreakdownId?: Types.ObjectId;
  monto: number;
  autoRenovar: boolean;
  renovadaDesdeId?: Types.ObjectId;
  // Snapshot del paquete al momento de comprar (inmutable post-creación)
  paqueteId?: Types.ObjectId;
  paqueteNombreSnapshot?: string;
  precioSnapshot?: number;
  sesionesPorPeriodoSnapshot?: number;
  activo: boolean;
  // Inscripción manual
  dependentId?: Types.ObjectId;
  dependentNombreSnapshot?: string;
  origenInscripcion: 'checkout' | 'manual';
  inscritoPor?: Types.ObjectId;
  precioEspecial: boolean;
  notaPrecioEspecial?: string;
  clasesPrepagadas?: IClasesPrepagadas;
  createdAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>({
  workshopId: { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  estado: { type: String, enum: ['pendiente_pago', 'activa', 'vencida', 'cancelada'], default: 'pendiente_pago' },
  sesionesTotales: { type: Number, required: true, min: 1 },
  sesionesUsadas: { type: Number, default: 0, min: 0 },
  sesionesDisponibles: { type: Number, required: true, min: 0 },
  fechaCompra: { type: Date, default: Date.now },
  fechaVencimiento: { type: Date, required: true },
  pagoRef: { type: String },
  paymentBreakdownId: { type: Schema.Types.ObjectId, ref: 'PaymentBreakdown' },
  monto: { type: Number, required: true, min: 0 },
  autoRenovar: { type: Boolean, default: true },
  renovadaDesdeId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
  // Snapshot de paquete — inmutable post-creación
  paqueteId:                 { type: Schema.Types.ObjectId },
  paqueteNombreSnapshot:     { type: String },
  precioSnapshot:            { type: Number, min: 0 },
  sesionesPorPeriodoSnapshot:{ type: Number, min: 1 },
  activo: { type: Boolean, default: true },
  // Inscripción manual
  dependentId:              { type: Schema.Types.ObjectId },
  dependentNombreSnapshot:  { type: String, maxlength: 100 },
  origenInscripcion:        { type: String, enum: ['checkout', 'manual'], default: 'checkout' },
  inscritoPor:              { type: Schema.Types.ObjectId, ref: 'User' },
  precioEspecial:           { type: Boolean, default: false },
  notaPrecioEspecial:       { type: String, maxlength: 500 },
  clasesPrepagadas: {
    cantidad:        { type: Number, min: 1 },
    consumidas:      { type: Number, default: 0, min: 0 },
    fechaPago:       { type: Date },
    metodoPago:      { type: String, enum: ['transferencia', 'efectivo', 'otro'] },
    montoDeclarado:  { type: Number, min: 0 },
    notaTallerista:  { type: String, maxlength: 500 },
    creadoPor:       { type: Schema.Types.ObjectId, ref: 'User' },
    caducaEn:        { type: Date },  // opcional: fecha límite de validez
  },
}, { timestamps: true });

// Validaciones de inscripción manual
SubscriptionSchema.pre('save', function (next) {
  if (this.origenInscripcion === 'manual' && !this.inscritoPor) {
    return next(new Error('[MANUAL] inscritoPor es obligatorio para origenInscripcion manual'))
  }
  if (this.dependentId && !this.dependentNombreSnapshot) {
    return next(new Error('[MANUAL] dependentNombreSnapshot es obligatorio cuando dependentId está presente'))
  }
  // Mongoose 8 inicializa subdocumentos con defaults aunque no se provean.
  // Verificamos 'cantidad' (campo requerido) en lugar del objeto entero para evitar
  // falsos positivos con { consumidas: 0 } creado por el default del schema.
  if (this.clasesPrepagadas?.cantidad) {
    const { cantidad, consumidas, fechaPago, metodoPago, creadoPor } = this.clasesPrepagadas
    if (this.origenInscripcion !== 'manual') {
      return next(new Error('[PREPAGADO] clasesPrepagadas solo permitido en inscripción manual'))
    }
    if (typeof cantidad !== 'number' || cantidad < 1) {
      return next(new Error('[PREPAGADO] cantidad debe ser un entero ≥ 1'))
    }
    if (typeof consumidas !== 'number' || consumidas < 0 || consumidas > cantidad) {
      return next(new Error('[PREPAGADO] consumidas debe estar entre 0 y cantidad'))
    }
    if (!fechaPago) {
      return next(new Error('[PREPAGADO] fechaPago es obligatorio'))
    }
    if (!metodoPago) {
      return next(new Error('[PREPAGADO] metodoPago es obligatorio'))
    }
    if (!creadoPor) {
      return next(new Error('[PREPAGADO] creadoPor es obligatorio'))
    }
  }
  next()
});

SubscriptionSchema.index({ workshopId: 1, studentId: 1, estado: 1 });
SubscriptionSchema.index({ studentId: 1, estado: 1 });
SubscriptionSchema.index({ fechaVencimiento: 1 });

// Solo 1 suscripción activa por (alumno, dependiente) por taller.
// dependentId se incluye para que un apoderado pueda tener varias subs activas
// (una propia + una por cada hijo) en el mismo workshop.
SubscriptionSchema.index(
  { workshopId: 1, studentId: 1, dependentId: 1 },
  { unique: true, partialFilterExpression: { estado: 'activa' } }
);

// [IDEMPOTENCIA] pagoRef único cuando está presente — evita duplicar Subscription por retries del webhook MP
SubscriptionSchema.index(
  { pagoRef: 1 },
  { unique: true, sparse: true }
);

export default mongoose.models.Subscription || mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
