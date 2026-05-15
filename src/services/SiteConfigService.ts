import connectDB from '@/lib/db'
import SiteConfig, { ISiteConfig } from '@/models/SiteConfig'

// Valores por defecto si no existe documento en DB
const DEFAULTS = {
  comisionPct: 15,
  liquidacionMinimaDefault: 5000,
  cuotaPorTalleristaMB: 1024,
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

  async update(data: Partial<Pick<ISiteConfig, 'comisionPct' | 'liquidacionMinimaDefault' | 'cuotaPorTalleristaMB'>>): Promise<ISiteConfig> {
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
}
