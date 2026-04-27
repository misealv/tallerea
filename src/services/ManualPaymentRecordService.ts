import 'server-only'
import dbConnect from '@/lib/db'
import ManualPaymentRecord, { IManualPaymentRecordDoc } from '@/models/ManualPaymentRecord'
import Workshop from '@/models/Workshop'
import { Types } from 'mongoose'
import type { ManualPaymentCreateInput } from '@/schemas/manualPayment'

export const ManualPaymentRecordService = {
  /** Crea un registro contable manual. Verifica que el taller pertenece al ownerId. */
  async create(ownerId: string, data: ManualPaymentCreateInput): Promise<IManualPaymentRecordDoc> {
    await dbConnect()

    // Multi-tenant: solo el dueño del taller puede registrar pagos
    const workshop = await Workshop.findOne({
      _id: data.workshopId,
      ownerId,
      activo: true,
    }).lean()
    if (!workshop) throw new Error('Taller no encontrado o no autorizado')

    const record = await new ManualPaymentRecord({
      ownerId: new Types.ObjectId(ownerId),
      studentId: new Types.ObjectId(data.studentId),
      dependentId: data.dependentId ? new Types.ObjectId(data.dependentId) : undefined,
      workshopId: new Types.ObjectId(data.workshopId),
      enrollmentId: data.enrollmentId ? new Types.ObjectId(data.enrollmentId) : undefined,
      subscriptionId: data.subscriptionId ? new Types.ObjectId(data.subscriptionId) : undefined,
      monto: data.monto,
      metodoPago: data.metodoPago,
      fecha: new Date(data.fecha),
      comprobanteUrl: data.comprobanteUrl,
      notas: data.notas,
    }).save()

    return record.toObject() as IManualPaymentRecordDoc
  },

  /** Lista los registros del tallerista, opcionalmente filtrados por workshopId. Máx 100. */
  async listByOwner(
    ownerId: string,
    workshopId?: string,
    limit = 100
  ): Promise<IManualPaymentRecordDoc[]> {
    await dbConnect()
    const filter: Record<string, unknown> = { ownerId: new Types.ObjectId(ownerId) }
    if (workshopId) filter.workshopId = new Types.ObjectId(workshopId)

    return ManualPaymentRecord.find(filter)
      .populate('workshopId', 'titulo')
      .populate('studentId', 'name email')
      .sort({ fecha: -1 })
      .limit(limit)
      .lean<IManualPaymentRecordDoc[]>()
  },

  /** Total declarado por un tallerista (para resumen financiero). */
  async totalByOwner(ownerId: string): Promise<number> {
    await dbConnect()
    const result = await ManualPaymentRecord.aggregate([
      { $match: { ownerId: new Types.ObjectId(ownerId) } },
      { $group: { _id: null, total: { $sum: '$monto' } } },
    ])
    return result[0]?.total ?? 0
  },
}
