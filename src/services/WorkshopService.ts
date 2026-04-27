import dbConnect from '@/lib/db'
import Workshop, { IWorkshop } from '@/models/Workshop'
import Location from '@/models/Location'
import '@/models/User' // Registrar modelo para populate de ownerId

interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

interface WorkshopFilters {
  tipo?: string
  modalidad?: string
  modeloAcceso?: 'puntual' | 'recurrente'
  comuna?: string
  ciudad?: string
  dia?: string
  precioMin?: number
  precioMax?: number
  ownerId?: string
  includeInactive?: boolean
}

export const WorkshopService = {

  async getAll(filters?: WorkshopFilters, page = 1, limit = 20): Promise<PaginatedResult<IWorkshop>> {
    await dbConnect()
    const query: Record<string, unknown> = filters?.includeInactive
      ? { deletedAt: null }
      : { activo: true, deletedAt: null }

    if (filters?.tipo) query.tipo = filters.tipo
    if (filters?.modalidad) query.modalidad = filters.modalidad
    if (filters?.modeloAcceso) query.modeloAcceso = filters.modeloAcceso
    if (filters?.ownerId) query.ownerId = filters.ownerId
    if (filters?.dia) query['slots.dia'] = filters.dia
    if (filters?.precioMin || filters?.precioMax) {
      query.precio = {}
      if (filters.precioMin) (query.precio as Record<string, number>).$gte = filters.precioMin
      if (filters.precioMax) (query.precio as Record<string, number>).$lte = filters.precioMax
    }
    if (filters?.comuna) {
      const locations = await Location.find({
        comuna: { $regex: filters.comuna, $options: 'i' },
        activo: true,
      }).select('_id').lean()
      query.locationId = { $in: locations.map(l => l._id) }
    }

    const [data, total] = await Promise.all([
      Workshop.find(query)
        .populate('locationId', 'nombre comuna ciudad')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<IWorkshop[]>(),
      Workshop.countDocuments(query)
    ])
    return { data, total, page, limit }
  },

  async getById(id: string): Promise<IWorkshop | null> {
    await dbConnect()
    return Workshop.findOne({ _id: id, activo: true, deletedAt: null })
      .populate('locationId', 'nombre direccion comuna ciudad')
      .lean<IWorkshop>()
  },

  async getByIdIncludingInactive(id: string): Promise<IWorkshop | null> {
    await dbConnect()
    return Workshop.findOne({ _id: id, deletedAt: null }).lean<IWorkshop>()
  },

  async getBySlug(slug: string): Promise<IWorkshop | null> {
    await dbConnect()
    return Workshop.findOne({ slug, activo: true, deletedAt: null })
      .populate('locationId', 'nombre direccion comuna ciudad coordenadas')
      .populate('ownerId', 'name image taller')
      .lean<IWorkshop>()
  },

  async getByOwnerId(ownerId: string, page = 1, limit = 20): Promise<PaginatedResult<IWorkshop>> {
    return this.getAll({ ownerId }, page, limit)
  },

  async create(data: Partial<IWorkshop>): Promise<IWorkshop> {
    await dbConnect()
    // Inicializar cupoDisponible en cada slot (campo unificado)
    if (data.slots && data.slots.length > 0) {
      data.slots = data.slots.map(s => ({
        ...s,
        cupoDisponible: s.cupoDisponible ?? s.cupoMax ?? (data.cupoPorSesion ?? 10),
      }))
    }
    return new Workshop(data).save()
  },

  async update(id: string, data: Partial<IWorkshop>): Promise<IWorkshop | null> {
    await dbConnect()
    const doc = await Workshop.findOneAndUpdate(
      { _id: id },
      data,
      { new: true, runValidators: true }
    )
    if (!doc) throw new Error(`Workshop ${id} no encontrado`)
    return doc
  },

  async delete(id: string): Promise<void> {
    await dbConnect()
    await Workshop.findByIdAndUpdate(id, { deletedAt: new Date() })
  },

  // Obtener cupo disponible total (suma de cupoDisponible por slot)
  getTotalCupoDisponible(workshop: IWorkshop): number {
    if (workshop.slots && workshop.slots.length > 0) {
      return workshop.slots.reduce((sum, s) => sum + (s.cupoDisponible ?? 0), 0)
    }
    return 0
  },
}
