import dbConnect from '@/lib/db'
import Account, { IAccount } from '@/models/Account'
import AccountMember from '@/models/AccountMember'

interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export const AccountService = {

  async getAll(filters?: Record<string, unknown>, page = 1, limit = 20): Promise<PaginatedResult<IAccount>> {
    await dbConnect()
    const query = { activo: true, ...filters }
    const [data, total] = await Promise.all([
      Account.find(query).skip((page - 1) * limit).limit(limit).lean<IAccount[]>(),
      Account.countDocuments(query)
    ])
    return { data, total, page, limit }
  },

  async getById(id: string): Promise<IAccount | null> {
    await dbConnect()
    return Account.findOne({ _id: id, activo: true }).lean<IAccount>()
  },

  async getBySlug(slug: string): Promise<IAccount | null> {
    await dbConnect()
    return Account.findOne({ slug, activo: true }).lean<IAccount>()
  },

  async getByOwnerId(ownerId: string): Promise<IAccount | null> {
    await dbConnect()
    return Account.findOne({ ownerId, activo: true }).lean<IAccount>()
  },

  // [DEPRECATED — Fase 1] Account es read-only durante la transición a User.taller.
  // Las escrituras se realizan vía TallerService sobre el modelo User.
  // Estos métodos lanzarán un error hasta que Account sea eliminado en Fase 11.

  async create(_data: Partial<IAccount>, _userId: string): Promise<IAccount> {
    throw new Error('[DEPRECATED] AccountService.create está deshabilitado. Usar TallerService.solicitar.')
  },

  async update(_id: string, _data: Partial<IAccount>): Promise<IAccount | null> {
    throw new Error('[DEPRECATED] AccountService.update está deshabilitado. Usar TallerService para modificar estado.')
  },

  async delete(_id: string): Promise<void> {
    throw new Error('[DEPRECATED] AccountService.delete está deshabilitado.')
  },
}
