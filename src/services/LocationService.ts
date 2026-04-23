import dbConnect from '@/lib/db'
import Location, { ILocation } from '@/models/Location'

interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export const LocationService = {

  async getAll(filters?: Record<string, unknown>, page = 1, limit = 20): Promise<PaginatedResult<ILocation>> {
    await dbConnect()
    const query = { activo: true, ...filters }
    const [data, total] = await Promise.all([
      Location.find(query).skip((page - 1) * limit).limit(limit).lean<ILocation[]>(),
      Location.countDocuments(query)
    ])
    return { data, total, page, limit }
  },

  async getByOwnerId(ownerId: string, page = 1, limit = 20): Promise<PaginatedResult<ILocation>> {
    return this.getAll({ ownerId }, page, limit)
  },

  async getById(id: string): Promise<ILocation | null> {
    await dbConnect()
    return Location.findOne({ _id: id, activo: true }).lean<ILocation>()
  },

  async create(data: Partial<ILocation>): Promise<ILocation> {
    await dbConnect()
    return new Location(data).save()
  },

  async update(id: string, data: Partial<ILocation>): Promise<ILocation | null> {
    await dbConnect()
    const doc = await Location.findOneAndUpdate(
      { _id: id, activo: true },
      data,
      { new: true, runValidators: true }
    )
    if (!doc) throw new Error(`Location ${id} no encontrada`)
    return doc
  },

  async delete(id: string): Promise<void> {
    await dbConnect()
    await Location.findByIdAndUpdate(id, { activo: false })
  },
}
