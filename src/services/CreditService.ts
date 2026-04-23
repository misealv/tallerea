import 'server-only'
import mongoose from 'mongoose'
import dbConnect from '@/lib/db'
import CreditTransaction, { ICreditTransaction } from '@/models/CreditTransaction'
import User from '@/models/User'

// Parámetros para otorgar crédito (reembolso o compensación)
interface OtorgarParams {
  userId: string
  monto: number          // CLP enteros, positivo
  origenTipo: 'reembolso' | 'compensacion' | 'admin'
  enrollmentId?: string
  subscriptionId?: string
  adminId?: string
  motivo: string
  session?: mongoose.ClientSession  // para unirse a una transacción externa
}

// Parámetros para usar crédito en checkout
interface UsarParams {
  userId: string
  monto: number          // CLP enteros, positivo — monto a descontar
  enrollmentId?: string
  subscriptionId?: string
  motivo: string
  session?: mongoose.ClientSession  // para usar dentro de una transacción externa
}

interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export const CreditService = {

  // Saldo actual del usuario (fuente de verdad: User.creditoDisponible)
  async getSaldo(userId: string): Promise<number> {
    await dbConnect()
    const user = await User.findById(userId).select('creditoDisponible').lean<{ creditoDisponible: number }>()
    return user?.creditoDisponible ?? 0
  },

  // Historial de transacciones de un usuario
  async getHistorial(
    userId: string,
    page = 1,
    limit = 20
  ): Promise<PaginatedResult<ICreditTransaction>> {
    await dbConnect()
    const query = { userId: new mongoose.Types.ObjectId(userId) }
    const [data, total] = await Promise.all([
      CreditTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<ICreditTransaction[]>(),
      CreditTransaction.countDocuments(query),
    ])
    return { data, total, page, limit }
  },

  // Otorgar crédito (reembolso o compensación por admin)
  // [FINANCE RISK] Modifica User.creditoDisponible + crea CreditTransaction append-only
  // Si recibe params.session, se ejecuta dentro de esa transacción (no abre una nueva).
  async otorgar(params: OtorgarParams): Promise<ICreditTransaction> {
    await dbConnect()
    if (!Number.isInteger(params.monto) || params.monto <= 0) {
      throw new Error('[FINANCE] monto debe ser entero positivo')
    }

    // Si el llamador provee session, usamos esa; si no, abrimos una propia.
    const externalSession = params.session
    const session = externalSession ?? await mongoose.startSession()
    const ownsTransaction = !externalSession
    if (ownsTransaction) session.startTransaction()

    try {
      const user = await User.findOneAndUpdate(
        { _id: params.userId, activo: true },
        { $inc: { creditoDisponible: params.monto } },
        { new: true, session }
      ).select('creditoDisponible').lean<{ _id: mongoose.Types.ObjectId; creditoDisponible: number }>()

      if (!user) throw new Error('Usuario no encontrado')

      const uid = new mongoose.Types.ObjectId(params.userId)
      const [tx] = await CreditTransaction.create([{
        userId:          uid,
        tipo:            'otorgado',
        monto:           params.monto,
        saldoResultante: user.creditoDisponible,
        origen: {
          tipo:           params.origenTipo,
          enrollmentId:   params.enrollmentId ? new mongoose.Types.ObjectId(params.enrollmentId) : undefined,
          subscriptionId: params.subscriptionId ? new mongoose.Types.ObjectId(params.subscriptionId) : undefined,
          adminId:        params.adminId ? new mongoose.Types.ObjectId(params.adminId) : undefined,
        },
        motivo: params.motivo,
      }], { session })

      if (ownsTransaction) await session.commitTransaction()
      return tx
    } catch (err) {
      if (ownsTransaction) await session.abortTransaction()
      throw err
    } finally {
      if (ownsTransaction) session.endSession()
    }
  },

  // Usar crédito en checkout. Operación atómica con $inc condicional.
  // [FINANCE RISK][RACE] Usa update condicional para evitar overspend concurrente.
  // Devuelve el monto efectivamente descontado (puede ser menor si el saldo no alcanza).
  async usar(params: UsarParams): Promise<{ montoUsado: number; tx: ICreditTransaction | null }> {
    await dbConnect()
    if (!Number.isInteger(params.monto) || params.monto <= 0) {
      throw new Error('[FINANCE] monto debe ser entero positivo')
    }

    const session = params.session ?? null

    // Paso 1: intentar descontar exactamente params.monto con guard condicional.
    // Si falla (saldo insuficiente), reintentamos con el saldo disponible.
    let updatedUser = await User.findOneAndUpdate(
      {
        _id: params.userId,
        activo: true,
        creditoDisponible: { $gte: params.monto },
      },
      { $inc: { creditoDisponible: -params.monto } },
      { new: true, session }
    ).select('creditoDisponible').lean<{ creditoDisponible: number }>()

    let montoUsado = 0
    if (updatedUser) {
      montoUsado = params.monto
    } else {
      // Saldo insuficiente: leer saldo actual (con session) y descontar lo disponible atómicamente.
      const current = await User.findOne({ _id: params.userId, activo: true })
        .select('creditoDisponible')
        .session(session)
        .lean<{ creditoDisponible: number }>()

      const saldo = current?.creditoDisponible ?? 0
      if (saldo <= 0) return { montoUsado: 0, tx: null }

      // Descuento atómico condicionado al saldo leído — si cambió entre reads, falla y retornamos 0.
      updatedUser = await User.findOneAndUpdate(
        {
          _id: params.userId,
          activo: true,
          creditoDisponible: saldo,
        },
        { $inc: { creditoDisponible: -saldo } },
        { new: true, session }
      ).select('creditoDisponible').lean<{ creditoDisponible: number }>()

      if (!updatedUser) return { montoUsado: 0, tx: null }
      montoUsado = saldo
    }

    const uid = new mongoose.Types.ObjectId(params.userId)
    const [tx] = await CreditTransaction.create([{
      userId:          uid,
      tipo:            'usado',
      monto:           -montoUsado,
      saldoResultante: updatedUser.creditoDisponible,
      origen: {
        tipo:           'checkout',
        enrollmentId:   params.enrollmentId ? new mongoose.Types.ObjectId(params.enrollmentId) : undefined,
        subscriptionId: params.subscriptionId ? new mongoose.Types.ObjectId(params.subscriptionId) : undefined,
      },
      motivo: params.motivo,
    }], { session })

    return { montoUsado, tx }
  },
}
