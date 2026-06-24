import connectDB from '@/lib/db'
import SiteConfig, { ISiteConfig } from '@/models/SiteConfig'

// Valores por defecto si no existe documento en DB
const DEFAULTS = {
  comisionPct: 15,
  liquidacionMinimaDefault: 5000,
  cuotaPorTalleristaMB: 1024,
  // [PAGO AUTOMÁTICO] Acordado Fase 0 — 2026-06-24
  descuentoPagoAutomaticoPct: 5,
  avisoPreCobroDias: 3,
  maxIntentosCobroFallido: 3,
  // [INCENTIVOS] Fase 7 — 2026-06-24
  incentivoAutopagoActivo: true,
  descuentoPagoAutomaticoActivo: true,
  incentivoAutopagoCopyCheckout: 'Activa el pago automático y ahorra un {pct}% cada mes. Cancela cuando quieras.',
  incentivoAutopagoCopyEmail: 'Activa el pago automático y ahorra un {pct}% cada mes, sin perder tu cupo. Cancela en 1 clic.',
  autopagoPreseleccionado: true,
}

export const SiteConfigService = {

  async get(): Promise<ISiteConfig> {
    await connectDB()
    let config = await SiteConfig.findOne({ singleton: true }).lean<ISiteConfig>()
    if (!config) {
      const doc = await new SiteConfig({ ...DEFAULTS, singleton: true }).save()
      config = doc.toObject() as ISiteConfig
    }
    return config
  },

  async update(data: Partial<Pick<ISiteConfig,
    'comisionPct' | 'liquidacionMinimaDefault' | 'cuotaPorTalleristaMB' |
    'descuentoPagoAutomaticoPct' | 'avisoPreCobroDias' | 'maxIntentosCobroFallido' |
    'incentivoAutopagoActivo' | 'descuentoPagoAutomaticoActivo' |
    'incentivoAutopagoCopyCheckout' | 'incentivoAutopagoCopyEmail' | 'autopagoPreseleccionado'
  >>): Promise<ISiteConfig> {
    await connectDB()
    const config = await SiteConfig.findOneAndUpdate(
      { singleton: true },
      { $set: data },
      { new: true, upsert: true, runValidators: true }
    )
    if (!config) throw new Error('Error actualizando configuración')
    return config
  },

  async getComisionPct(): Promise<number> {
    const config = await this.get()
    return config.comisionPct
  },

  async getCuotaPorTalleristaMB(): Promise<number> {
    const config = await this.get()
    return config.cuotaPorTalleristaMB ?? 1024
  },

  /**
   * Resuelve el monto con descuento de auto-pago, si el incentivo está activo.
   * El descuento sale del margen de Tallerea (feeTallerea), no del montoProfesor.
   * [FINANCE RISK] Usar SOLO para el transaction_amount del preapproval.
   */
  async calcularMontoConDescuento(montoBase: number): Promise<{ montoFinal: number; descuentoCLP: number; descuentoPct: number }> {
    const config = await this.get()
    const activo = config.incentivoAutopagoActivo && config.descuentoPagoAutomaticoActivo
    const pct = activo ? (config.descuentoPagoAutomaticoPct ?? 0) : 0
    if (pct === 0) return { montoFinal: montoBase, descuentoCLP: 0, descuentoPct: 0 }
    const descuentoCLP = Math.round(montoBase * pct / 100)
    return { montoFinal: montoBase - descuentoCLP, descuentoCLP, descuentoPct: pct }
  },

  /**
   * Interpola {pct} en el copy del incentivo con el % configurado.
   */
  async getCopyIncentivo(tipo: 'checkout' | 'email'): Promise<string | null> {
    const config = await this.get()
    if (!config.incentivoAutopagoActivo) return null
    const pct = config.descuentoPagoAutomaticoPct ?? 0
    const raw = tipo === 'checkout' ? config.incentivoAutopagoCopyCheckout : config.incentivoAutopagoCopyEmail
    return (raw ?? '').replace(/\{pct\}/g, String(pct))
  },
}
