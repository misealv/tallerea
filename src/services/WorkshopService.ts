import dbConnect from '@/lib/db'
import Workshop, { IWorkshop } from '@/models/Workshop'
import Location from '@/models/Location'
import '@/models/Account'

interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

interface WorkshopFilters {
  tipo?: string
  modalidad?: string
  comuna?: string
  ciudad?: string
  dia?: string
  precioMin?: number
  precioMax?: number
  accountId?: string
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
    if (filters?.accountId) query.accountId = filters.accountId
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
      .populate('accountId', 'nombre slug logo tipo')
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
      .populate('accountId', 'nombre slug logo tipo verificado')
      .lean<IWorkshop>()
  },

  async getByAccountId(accountId: string, page = 1, limit = 20): Promise<PaginatedResult<IWorkshop>> {
    return this.getAll({ accountId }, page, limit)
  },

  async create(data: Partial<IWorkshop>): Promise<IWorkshop> {
    await dbConnect()
    // Inicializar cupoDisponible en cada slot
    if (data.slots && data.slots.length > 0) {
      data.slots = data.slots.map(s => ({ ...s, cupoDisponible: s.cupoMax }))
    }
    return new Workshop({ ...data, cupoDisponible: data.cupoMax }).save()
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

  // Obtener cupo disponible total (suma de slots o cupo raíz)
  getTotalCupoDisponible(workshop: IWorkshop): number {
    if (workshop.slots && workshop.slots.length > 0) {
      return workshop.slots.reduce((sum, s) => sum + (s.cupoDisponible ?? 0), 0)
    }
    return workshop.cupoDisponible
  },
}
