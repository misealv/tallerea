import mongoose, { Schema, Document } from 'mongoose'

export interface ISiteConfig extends Document {
  comisionPct: number
  liquidacionMinimaDefault: number
  // Singleton: solo 1 documento
  singleton: boolean
}

const SiteConfigSchema = new Schema<ISiteConfig>({
  comisionPct: { type: Number, required: true, default: 15, min: 0, max: 100 },
  liquidacionMinimaDefault: { type: Number, required: true, default: 5000, min: 0 },
  singleton: { type: Boolean, default: true, unique: true },
}, { timestamps: true })

export default mongoose.models.SiteConfig || mongoose.model<ISiteConfig>('SiteConfig', SiteConfigSchema)
