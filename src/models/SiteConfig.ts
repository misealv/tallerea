import mongoose, { Schema, Document } from 'mongoose'

export interface ISiteConfig extends Document {
  comisionPct: number
  liquidacionMinimaDefault: number
  cuotaPorTalleristaMB: number
  // [PAGO AUTOMÁTICO] Configuración del mandato preapproval
  descuentoPagoAutomaticoPct: number   // % de descuento por domiciliar el pago (default 5)
  avisoPreCobroDias: number            // días de antelación para el email de aviso pre-cobro (default 3)
  maxIntentosCobroFallido: number      // intentos de Tallerea antes de degradar a manual (default 3)
  // [INCENTIVOS] Fase 7 — configurables desde /admin/configuracion, nunca hardcoded
  incentivoAutopagoActivo: boolean     // switch maestro: muestra el nudge en checkout y emails (default true)
  descuentoPagoAutomaticoActivo: boolean // si aplica el descuento al transaction_amount (default true cuando pct > 0)
  incentivoAutopagoCopyCheckout: string  // texto del nudge en checkout
  incentivoAutopagoCopyEmail: string     // texto del nudge en email de renovación manual
  autopagoPreseleccionado: boolean       // si la opción aparece marcada por defecto en checkout (default true)
  // Singleton: solo 1 documento
  singleton: boolean
}

const SiteConfigSchema = new Schema<ISiteConfig>({
  comisionPct: { type: Number, required: true, default: 15, min: 0, max: 100 },
  liquidacionMinimaDefault: { type: Number, required: true, default: 5000, min: 0 },
  cuotaPorTalleristaMB: { type: Number, required: true, default: 1024, min: 0 },
  // [PAGO AUTOMÁTICO] Acordado en Fase 0 con la dueña del producto (2026-06-24)
  descuentoPagoAutomaticoPct:  { type: Number, required: true, default: 5,  min: 0, max: 100 },
  avisoPreCobroDias:           { type: Number, required: true, default: 3,  min: 0, max: 30 },
  maxIntentosCobroFallido:     { type: Number, required: true, default: 3,  min: 1, max: 10 },
  // [INCENTIVOS] Fase 7 — editables desde /admin/configuracion, nunca hardcoded
  incentivoAutopagoActivo:           { type: Boolean, required: true, default: true },
  descuentoPagoAutomaticoActivo:     { type: Boolean, required: true, default: true },
  incentivoAutopagoCopyCheckout:     { type: String,  required: true, default: 'Activa el pago automático y ahorra un {pct}% cada mes. Cancela cuando quieras.', maxlength: 300 },
  incentivoAutopagoCopyEmail:        { type: String,  required: true, default: 'Activa el pago automático y ahorra un {pct}% cada mes, sin perder tu cupo. Cancela en 1 clic.', maxlength: 300 },
  autopagoPreseleccionado:           { type: Boolean, required: true, default: true },
  singleton: { type: Boolean, default: true, unique: true },
}, { timestamps: true })

export default mongoose.models.SiteConfig || mongoose.model<ISiteConfig>('SiteConfig', SiteConfigSchema)
