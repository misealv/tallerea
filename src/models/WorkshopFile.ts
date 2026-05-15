import mongoose, { Schema, Document, Types } from 'mongoose'

export type FileNodeType = 'file' | 'folder'
export type FileVisibilidad = 'tallerista' | 'alumnos'
export type FileResourceType = 'image' | 'video' | 'raw'

export interface IWorkshopFile {
  workshopId: Types.ObjectId
  ownerId: Types.ObjectId          // tallerista propietario del taller
  uploadedBy: Types.ObjectId       // quien subió el archivo o creó la carpeta
  parentFolderId: Types.ObjectId | null  // null = raíz
  tipo: FileNodeType
  nombre: string
  visibilidad: FileVisibilidad     // hereda de la carpeta padre; raíz default 'alumnos'
  // Solo para tipo === 'file'
  cloudinaryPublicId?: string
  cloudinaryUrl?: string
  resourceType?: FileResourceType
  mimeType?: string
  size?: number                    // bytes
  activo: boolean
}

export interface IWorkshopFileDoc extends IWorkshopFile, Document {
  _id: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const WorkshopFileSchema = new Schema<IWorkshopFileDoc>({
  workshopId:    { type: Schema.Types.ObjectId, ref: 'Workshop', required: true, index: true },
  ownerId:       { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  uploadedBy:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  parentFolderId:{ type: Schema.Types.ObjectId, ref: 'WorkshopFile', default: null },
  tipo:          { type: String, enum: ['file', 'folder'], required: true },
  nombre:        { type: String, required: true, maxlength: 200, trim: true },
  visibilidad:   { type: String, enum: ['tallerista', 'alumnos'], default: 'alumnos' },
  cloudinaryPublicId: { type: String },
  cloudinaryUrl:      { type: String },
  resourceType:       { type: String, enum: ['image', 'video', 'raw'] },
  mimeType:           { type: String },
  size:               { type: Number, min: 0 },
  activo:             { type: Boolean, default: true },
}, { timestamps: true })

// Índices: listado de un nivel + búsqueda por owner para cuota
WorkshopFileSchema.index({ workshopId: 1, parentFolderId: 1, activo: 1 })
WorkshopFileSchema.index({ ownerId: 1, tipo: 1, activo: 1 })
WorkshopFileSchema.index({ cloudinaryPublicId: 1 }, { unique: true, sparse: true })

// Validación: si es file → debe tener cloudinaryPublicId y size
WorkshopFileSchema.pre('save', function(next) {
  if (this.tipo === 'file') {
    if (!this.cloudinaryPublicId) return next(new Error('File requiere cloudinaryPublicId'))
    if (typeof this.size !== 'number' || this.size < 0) return next(new Error('File requiere size válido'))
  }
  if (this.tipo === 'folder') {
    // Carpetas no llevan datos de archivo
    this.cloudinaryPublicId = undefined
    this.cloudinaryUrl = undefined
    this.resourceType = undefined
    this.mimeType = undefined
    this.size = undefined
  }
  next()
})

export default (mongoose.models.WorkshopFile as mongoose.Model<IWorkshopFileDoc>) ||
  mongoose.model<IWorkshopFileDoc>('WorkshopFile', WorkshopFileSchema)
