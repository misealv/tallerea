import 'server-only'
import dbConnect from '@/lib/db'
import WorkshopFile, { IWorkshopFile, IWorkshopFileDoc, FileVisibilidad } from '@/models/WorkshopFile'
import { SiteConfigService } from '@/services/SiteConfigService'
import cloudinary from '@/lib/cloudinary'
import { Types } from 'mongoose'

// Tipos de archivo permitidos → resourceType de Cloudinary
const ALLOWED_MIME_TYPES: Record<string, 'image' | 'video' | 'raw'> = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/gif': 'image',
  'video/mp4': 'video', 'video/quicktime': 'video', 'video/webm': 'video',
  'application/pdf': 'raw',
  'application/msword': 'raw',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'raw',
  'application/vnd.ms-powerpoint': 'raw',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'raw',
  'application/zip': 'raw',
  'text/plain': 'raw',
}

export function getAllowedMimeTypes(): string[] {
  return Object.keys(ALLOWED_MIME_TYPES)
}

export function getResourceType(mimeType: string): 'image' | 'video' | 'raw' | null {
  return ALLOWED_MIME_TYPES[mimeType] ?? null
}

const MAX_PROFUNDIDAD = 10

// Bytes usados por el tallerista en todos sus talleres
async function calcularCuotaUsada(ownerId: string): Promise<number> {
  const result = await WorkshopFile.aggregate([
    { $match: { ownerId: new Types.ObjectId(ownerId), tipo: 'file', activo: true } },
    { $group: { _id: null, total: { $sum: '$size' } } },
  ])
  return result[0]?.total ?? 0
}

// Verifica que la carpeta padre exista, pertenezca al workshop, sea tipo folder y esté activa.
// Retorna la profundidad de esa carpeta (0 = raíz). Lanza si inválido o profundidad excedida.
async function validarPadre(
  workshopId: string,
  parentFolderId: string | null,
): Promise<number> {
  if (!parentFolderId) return 0
  const padre = await WorkshopFile.findOne({
    _id: new Types.ObjectId(parentFolderId),
    workshopId: new Types.ObjectId(workshopId),
    tipo: 'folder',
    activo: true,
  }).select('_id parentFolderId').lean<IWorkshopFileDoc>()
  if (!padre) throw new Error('Carpeta padre no encontrada en este taller')
  // Calcular profundidad subiendo por ancestros
  let depth = 1
  let current: { parentFolderId: Types.ObjectId | null } | null = padre
  while (current?.parentFolderId) {
    depth++
    if (depth > MAX_PROFUNDIDAD) throw new Error(`Profundidad máxima de carpetas excedida (${MAX_PROFUNDIDAD})`)
    current = await WorkshopFile.findById(current.parentFolderId).select('parentFolderId').lean<{ parentFolderId: Types.ObjectId | null }>()
  }
  return depth
}

export const WorkshopFileService = {

  // Listar un nivel: carpetas + archivos de parentFolderId (null = raíz)
  async listar(
    workshopId: string,
    parentFolderId: string | null,
    visibilidadPermitida: FileVisibilidad[],
  ): Promise<IWorkshopFileDoc[]> {
    await dbConnect()
    return WorkshopFile.find({
      workshopId: new Types.ObjectId(workshopId),
      parentFolderId: parentFolderId ? new Types.ObjectId(parentFolderId) : null,
      visibilidad: { $in: visibilidadPermitida },
      activo: true,
    })
      .sort({ tipo: -1, nombre: 1 })  // carpetas primero, luego archivos A-Z
      .lean<IWorkshopFileDoc[]>()
  },

  // Breadcrumb: array de ancestros desde raíz hasta parentFolderId
  async breadcrumb(folderId: string | null): Promise<{ _id: string; nombre: string }[]> {
    if (!folderId) return []
    await dbConnect()
    const crumbs: { _id: string; nombre: string }[] = []
    let current: IWorkshopFileDoc | null = await WorkshopFile.findById(folderId).lean<IWorkshopFileDoc>()
    while (current) {
      crumbs.unshift({ _id: String(current._id), nombre: current.nombre })
      if (!current.parentFolderId) break
      current = await WorkshopFile.findById(current.parentFolderId).lean<IWorkshopFileDoc>()
    }
    return crumbs
  },

  // Crear carpeta
  async crearCarpeta(data: {
    workshopId: string
    ownerId: string
    uploadedBy: string
    parentFolderId: string | null
    nombre: string
    visibilidad: FileVisibilidad
  }): Promise<IWorkshopFileDoc> {
    await dbConnect()
    // Validar que el padre pertenezca al taller y respete profundidad máxima
    await validarPadre(data.workshopId, data.parentFolderId)
    // Verificar nombre único en el mismo nivel
    const existe = await WorkshopFile.findOne({
      workshopId: new Types.ObjectId(data.workshopId),
      parentFolderId: data.parentFolderId ? new Types.ObjectId(data.parentFolderId) : null,
      nombre: { $regex: new RegExp(`^${data.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      activo: true,
    })
    if (existe) throw new Error(`Ya existe un elemento llamado "${data.nombre}" en esta ubicación`)

    const doc = await new WorkshopFile({
      workshopId:     new Types.ObjectId(data.workshopId),
      ownerId:        new Types.ObjectId(data.ownerId),
      uploadedBy:     new Types.ObjectId(data.uploadedBy),
      parentFolderId: data.parentFolderId ? new Types.ObjectId(data.parentFolderId) : null,
      tipo: 'folder',
      nombre: data.nombre,
      visibilidad: data.visibilidad,
    }).save()
    return doc.toObject()
  },

  // Registrar archivo post-upload directo a Cloudinary
  async registrarArchivo(data: {
    workshopId: string
    ownerId: string
    uploadedBy: string
    parentFolderId: string | null
    nombre: string
    visibilidad: FileVisibilidad
    cloudinaryPublicId: string
    cloudinaryUrl: string
    mimeType: string
    size: number          // bytes
  }): Promise<IWorkshopFileDoc> {
    await dbConnect()

    const resourceType = getResourceType(data.mimeType)
    if (!resourceType) throw new Error(`Tipo de archivo no permitido: ${data.mimeType}`)

    // Validar carpeta padre dentro del mismo taller
    await validarPadre(data.workshopId, data.parentFolderId)

    // Validar cuota
    const [cuotaUsadaBytes, config] = await Promise.all([
      calcularCuotaUsada(data.ownerId),
      SiteConfigService.get(),
    ])
    const cuotaMaxBytes = (config.cuotaPorTalleristaMB ?? 1024) * 1024 * 1024
    if (cuotaUsadaBytes + data.size > cuotaMaxBytes) {
      throw new Error(
        `Cuota superada — usados ${Math.round(cuotaUsadaBytes / 1024 / 1024)}MB de ${config.cuotaPorTalleristaMB ?? 1024}MB`
      )
    }

    // Verificar nombre único en el mismo nivel
    const existe = await WorkshopFile.findOne({
      workshopId: new Types.ObjectId(data.workshopId),
      parentFolderId: data.parentFolderId ? new Types.ObjectId(data.parentFolderId) : null,
      nombre: { $regex: new RegExp(`^${data.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      activo: true,
    })
    if (existe) throw new Error(`Ya existe un elemento llamado "${data.nombre}" en esta ubicación`)

    const doc = await new WorkshopFile({
      workshopId:         new Types.ObjectId(data.workshopId),
      ownerId:            new Types.ObjectId(data.ownerId),
      uploadedBy:         new Types.ObjectId(data.uploadedBy),
      parentFolderId:     data.parentFolderId ? new Types.ObjectId(data.parentFolderId) : null,
      tipo: 'file',
      nombre: data.nombre,
      visibilidad: data.visibilidad,
      cloudinaryPublicId: data.cloudinaryPublicId,
      cloudinaryUrl:      data.cloudinaryUrl,
      resourceType,
      mimeType:           data.mimeType,
      size:               data.size,
    }).save()
    return doc.toObject()
  },

  // Renombrar (file o folder) / mover a otra carpeta padre
  async actualizar(
    fileId: string,
    ownerId: string,
    data: { nombre?: string; parentFolderId?: string | null; visibilidad?: FileVisibilidad }
  ): Promise<IWorkshopFileDoc> {
    await dbConnect()
    const node = await WorkshopFile.findOne({ _id: fileId, ownerId: new Types.ObjectId(ownerId), activo: true })
    if (!node) throw new Error('Elemento no encontrado')

    // Evitar mover una carpeta dentro de sí misma o de sus descendientes
    if (data.parentFolderId !== undefined) {
      // Validar que el nuevo padre pertenezca al mismo taller
      await validarPadre(String(node.workshopId), data.parentFolderId)
      if (node.tipo === 'folder') {
        if (data.parentFolderId === fileId) throw new Error('No puedes mover una carpeta dentro de sí misma')
        const esDescendiente = await this._esDescendiente(fileId, data.parentFolderId)
        if (esDescendiente) throw new Error('No puedes mover una carpeta dentro de una de sus subcarpetas')
      }
    }

    if (data.nombre !== undefined) node.nombre = data.nombre
    if (data.visibilidad !== undefined) node.visibilidad = data.visibilidad
    if (data.parentFolderId !== undefined) {
      node.parentFolderId = data.parentFolderId ? new Types.ObjectId(data.parentFolderId) : null
    }

    await node.save()
    return node.toObject()
  },

  // Borrado soft: si es carpeta borra recursivamente todos los descendientes
  async eliminar(fileId: string, ownerId: string): Promise<void> {
    await dbConnect()
    const node = await WorkshopFile.findOne({ _id: fileId, ownerId: new Types.ObjectId(ownerId), activo: true })
    if (!node) throw new Error('Elemento no encontrado')

    if (node.tipo === 'folder') {
      await this._eliminarRecursivo(fileId, ownerId)
    } else {
      node.activo = false
      await node.save()
      // Borrar asset de Cloudinary (fire-and-forget, no bloqueante)
      if (node.cloudinaryPublicId) {
        cloudinary.uploader.destroy(node.cloudinaryPublicId, {
          resource_type: node.resourceType ?? 'raw',
          invalidate: true,
        }).catch(() => null)
      }
    }
  },

  // Cuota usada por un tallerista (en bytes)
  async cuotaUsada(ownerId: string): Promise<{ usadoBytes: number; maximoBytes: number; pct: number }> {
    await dbConnect()
    const [usadoBytes, config] = await Promise.all([
      calcularCuotaUsada(ownerId),
      SiteConfigService.get(),
    ])
    const maximoBytes = (config.cuotaPorTalleristaMB ?? 1024) * 1024 * 1024
    const pct = maximoBytes > 0 ? Math.min(100, Math.round((usadoBytes / maximoBytes) * 100)) : 0
    return { usadoBytes, maximoBytes, pct }
  },

  // Generar firma para upload directo a Cloudinary (resource_type dinámico)
  generarFirma(workshopId: string, resourceType: 'image' | 'video' | 'raw'): {
    signature: string; timestamp: number; folder: string;
    cloudName: string; apiKey: string; resourceType: string
  } {
    const timestamp = Math.round(Date.now() / 1000)
    const folder = `tallerea/workshops/${workshopId}/materiales`
    const params = { timestamp, folder }
    const { utils } = cloudinary
    const signature = utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET || '')
    return {
      signature,
      timestamp,
      folder,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
      apiKey:    process.env.CLOUDINARY_API_KEY || '',
      resourceType,
    }
  },

  // ─── Helpers privados ────────────────────────────────────────────────────────

  async _eliminarRecursivo(folderId: string, ownerId: string): Promise<void> {
    // Hijos directos
    const hijos = await WorkshopFile.find({
      parentFolderId: new Types.ObjectId(folderId),
      activo: true,
    }).lean<IWorkshopFileDoc[]>()

    for (const hijo of hijos) {
      if (hijo.tipo === 'folder') {
        await this._eliminarRecursivo(String(hijo._id), ownerId)
      } else {
        if (hijo.cloudinaryPublicId) {
          cloudinary.uploader.destroy(hijo.cloudinaryPublicId, {
            resource_type: hijo.resourceType ?? 'raw',
            invalidate: true,
          }).catch(() => null)
        }
      }
    }

    // Soft delete todos los hijos de este nivel y la carpeta misma
    await WorkshopFile.updateMany(
      { parentFolderId: new Types.ObjectId(folderId) },
      { activo: false }
    )
    await WorkshopFile.findByIdAndUpdate(folderId, { activo: false })
  },

  async _esDescendiente(folderId: string, candidatoId: string | null): Promise<boolean> {
    if (!candidatoId) return false
    let current = await WorkshopFile.findById(candidatoId).select('parentFolderId').lean<IWorkshopFileDoc>()
    let depth = 0
    while (current) {
      depth++
      if (depth > MAX_PROFUNDIDAD + 1) return false  // guard anti-ciclo
      if (String(current._id) === folderId) return true
      if (!current.parentFolderId) return false
      current = await WorkshopFile.findById(current.parentFolderId).select('parentFolderId').lean<IWorkshopFileDoc>()
    }
    return false
  },
}
