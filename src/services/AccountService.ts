import dbConnect from '@/lib/db'
import Account, { IAccount } from '@/models/Account'
// AccountMember diferido post-MVP (Fase 11)

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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async create(data: Partial<IAccount>, userId: string): Promise<IAccount> {
    void data; void userId
    throw new Error('[DEPRECATED] AccountService.create está deshabilitado. Usar TallerService.solicitar.')
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async update(id: string, data: Partial<IAccount>): Promise<IAccount | null> {
    void id; void data
    throw new Error('[DEPRECATED] AccountService.update está deshabilitado. Usar TallerService para modificar estado.')
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async delete(id: string): Promise<void> {
    void id
    throw new Error('[DEPRECATED] AccountService.delete está deshabilitado.')
  },
}
