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

  async create(data: Partial<IAccount>, userId: string): Promise<IAccount> {
    await dbConnect()
    const account = await new Account({ ...data, ownerId: userId }).save()

    // Crear AccountMember automático con rol owner
    await new AccountMember({
      accountId: account._id,
      userId,
      rol: 'owner',
      nombre: account.nombre,
      aceptado: true,
      activo: true,
    }).save()

    return account
  },

  async update(id: string, data: Partial<IAccount>): Promise<IAccount | null> {
    await dbConnect()
    const doc = await Account.findOneAndUpdate(
      { _id: id, activo: true },
      data,
      { new: true, runValidators: true }
    )
    if (!doc) throw new Error(`Account ${id} no encontrado`)
    return doc
  },

  async delete(id: string): Promise<void> {
    await dbConnect()
    await Account.findByIdAndUpdate(id, { activo: false })
  },
}
