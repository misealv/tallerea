import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IClasesPrepagadas {
  cantidad: number;
  consumidas: number;
  fechaPago: Date;
  metodoPago: 'transferencia' | 'efectivo' | 'mercadopago' | 'otro';
  montoDeclarado?: number;
  notaTallerista?: string;
  creadoPor: Types.ObjectId;
  caducaEn?: Date;  // fecha hasta la que son válidas las clases prepagadas
}

export interface IPagoFiado {
  montoAdeudado: number;          // CLP enteros — saldo que el alumno debe
  fechaCompromiso?: Date;         // fecha esperada de pago
  autorizadoPor: Types.ObjectId;  // tallerista que autorizó la confianza
  nota?: string;
  saldado: boolean;
  saldadoEn?: Date;
  metodoPagoFinal?: 'transferencia' | 'efectivo' | 'mercadopago';
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
  // [PAGO PENDIENTE] Cache del link MP para evitar regenerar preferences en cada page load
  mpInitPoint?: string;
  mpInitPointCreatedAt?: Date;
  clasesPrepagadas?: IClasesPrepagadas;
  // [FIADO] Activación a confianza: acceso inmediato con pago pendiente
  pagoFiado?: IPagoFiado;
  reviewEmailEnviadoEn?: Date;
  // [PAGO AUTOMÁTICO] Mandato preapproval de MercadoPago
  pagoAutomatico: boolean;
  mpPreapprovalId?: string;          // id del preapproval en MP
  mpPreapprovalStatus?: 'authorized' | 'paused' | 'cancelled' | 'pending';
  cardLast4?: string;                // últimos 4 dígitos (informativo, no sensible)
  ultimoCobroAutomaticoEn?: Date;
  intentosCobroFallidos: number;     // contador de cobros fallidos; se resetea al cobrar OK
  // [BANCO DE SESIONES] Fase 7.5
  saldoEnGracia?: boolean;            // true cuando el saldo entró en ventana de gracia tras cancelar mandato
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
  // [PAGO PENDIENTE] Cache del link MP — se reusa hasta 7 días antes de regenerar.
  // Evita pollution en MP y bug de doble cobro por preferences obsoletas.
  mpInitPoint:              { type: String },
  mpInitPointCreatedAt:     { type: Date },
  clasesPrepagadas: {
    cantidad:        { type: Number, min: 1 },
    consumidas:      { type: Number, default: 0, min: 0 },
    fechaPago:       { type: Date },
    metodoPago:      { type: String, enum: ['transferencia', 'efectivo', 'mercadopago', 'otro'] },
    montoDeclarado:  { type: Number, min: 0 },
    notaTallerista:  { type: String, maxlength: 500 },
    creadoPor:       { type: Schema.Types.ObjectId, ref: 'User' },
    caducaEn:        { type: Date },  // opcional: fecha límite de validez
  },
  // [FIADO] Venta a confianza: la sub queda 'activa' (acceso inmediato) con deuda registrada.
  // No genera PaymentBreakdown hasta saldar; la liquidación nunca incluye deuda sin saldar.
  pagoFiado: {
    montoAdeudado:   { type: Number, min: 1 },
    fechaCompromiso: { type: Date },
    autorizadoPor:   { type: Schema.Types.ObjectId, ref: 'User' },
    nota:            { type: String, maxlength: 500 },
    saldado:         { type: Boolean, default: false },
    saldadoEn:       { type: Date },
    metodoPagoFinal: { type: String, enum: ['transferencia', 'efectivo', 'mercadopago'] },
  },
  reviewEmailEnviadoEn: { type: Date },
  // [PAGO AUTOMÁTICO] Mandato preapproval de MercadoPago
  pagoAutomatico:            { type: Boolean, default: false },
  mpPreapprovalId:           { type: String },
  mpPreapprovalStatus:       { type: String, enum: ['authorized', 'paused', 'cancelled', 'pending'] },
  cardLast4:                 { type: String, maxlength: 4 },
  ultimoCobroAutomaticoEn:   { type: Date },
  intentosCobroFallidos:     { type: Number, default: 0, min: 0 },
  // [BANCO DE SESIONES] Fase 7.5
  saldoEnGracia:             { type: Boolean, default: false },
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
    // En estado 'pendiente_pago' aún no hubo pago, así que fechaPago/metodoPago
    // pueden estar vacíos. Se completan al activar (handleApprovedSubscription).
    if (this.estado !== 'pendiente_pago') {
      if (!fechaPago) {
        return next(new Error('[PREPAGADO] fechaPago es obligatorio'))
      }
      if (!metodoPago) {
        return next(new Error('[PREPAGADO] metodoPago es obligatorio'))
      }
    }
    if (!creadoPor) {
      return next(new Error('[PREPAGADO] creadoPor es obligatorio'))
    }
    if (this.clasesPrepagadas.caducaEn && fechaPago && this.clasesPrepagadas.caducaEn <= fechaPago) {
      return next(new Error('[PREPAGADO] caducaEn debe ser posterior a fechaPago'))
    }
  }
  // [FIADO] Validación de venta a confianza. Verificamos 'montoAdeudado' (sin default)
  // para evitar falsos positivos con el subdoc inicializado por Mongoose ({ saldado: false }).
  if (this.pagoFiado?.montoAdeudado) {
    if (!Number.isInteger(this.pagoFiado.montoAdeudado) || this.pagoFiado.montoAdeudado < 1) {
      return next(new Error('[FIADO] montoAdeudado debe ser un entero CLP ≥ 1'))
    }
    if (!this.pagoFiado.autorizadoPor) {
      return next(new Error('[FIADO] autorizadoPor es obligatorio'))
    }
    if (this.pagoFiado.saldado && !this.pagoFiado.saldadoEn) {
      this.pagoFiado.saldadoEn = new Date()
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

// [RACE] Solo 1 sub pendiente_pago por (alumno, dependiente, taller).
// Evita que un doble click genere 2 links MP simultáneos para el mismo menor.
SubscriptionSchema.index(
  { workshopId: 1, studentId: 1, dependentId: 1, estado: 1 },
  { unique: true, partialFilterExpression: { estado: 'pendiente_pago' } }
);

// [IDEMPOTENCIA] pagoRef único cuando está presente — evita duplicar Subscription por retries del webhook MP
SubscriptionSchema.index(
  { pagoRef: 1 },
  { unique: true, sparse: true }
);

// [IDEMPOTENCIA] Un solo preapproval activo por suscripción. Sparse permite nulos.
SubscriptionSchema.index(
  { mpPreapprovalId: 1 },
  { unique: true, sparse: true, name: 'mpPreapprovalId_unique_sparse' }
);

export default mongoose.models.Subscription || mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
