import dbConnect from '@/lib/db'
import Liquidation, { ILiquidation } from '@/models/Liquidation'
import PaymentBreakdown from '@/models/PaymentBreakdown'
import Account from '@/models/Account'
import User from '@/models/User'
import { FinanceService } from '@/services/FinanceService'

interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

// Formato CSV bancario chileno: RUT;Nombre;Banco;TipoCuenta;NroCuenta;Monto;Glosa
interface CsvRow {
  rut: string
  nombre: string
  banco: string
  tipoCuenta: string
  numeroCuenta: string
  monto: number
  glosa: string
}

export const LiquidationService = {

  async getAll(
    filters?: Record<string, unknown>,
    page = 1,
    limit = 20
  ): Promise<PaginatedResult<ILiquidation>> {
    await dbConnect()
    const query = { ...filters }
    const [data, total] = await Promise.all([
      Liquidation.find(query)
        .populate('accountId', 'nombre slug datosBancarios')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean<ILiquidation[]>(),
      Liquidation.countDocuments(query),
    ])
    return { data, total, page, limit }
  },

  async getById(id: string): Promise<ILiquidation | null> {
    await dbConnect()
    return Liquidation.findById(id)
      .populate('accountId', 'nombre slug datosBancarios liquidacionMinima')
      .populate('breakdowns')
      .lean<ILiquidation>()
  },

  // Generar liquidación para un profesor (ownerId o accountId legacy)
  async generate(
    subjectId: string,
    desde: Date,
    hasta: Date,
    userId: string,
    mode: 'ownerId' | 'accountId' = 'ownerId'
  ): Promise<ILiquidation> {
    await dbConnect()

    // Construir filtro de breakdowns según modo
    const breakdownFilter: Record<string, unknown> = {
      estado: 'cobrado',
      liquidationId: { $exists: false },
      fechaCobro: { $gte: desde, $lte: hasta },
    }
    if (mode === 'ownerId') {
      breakdownFilter.ownerId = subjectId
    } else {
      breakdownFilter.accountId = subjectId
    }

    const breakdowns = await PaymentBreakdown.find(breakdownFilter)

    if (breakdowns.length === 0) {
      throw new Error('No hay pagos cobrados para liquidar en este período')
    }

    // Sumar totales
    const totalBruto = breakdowns.reduce((acc, b) => acc + b.montoBruto, 0)
    const totalFeeTallerea = breakdowns.reduce((acc, b) => acc + b.feeTallerea, 0)
    const totalProfesor = breakdowns.reduce((acc, b) => acc + b.montoProfesor, 0)

    // [CUADRATURA] Verificar antes de crear
    if (totalBruto !== totalProfesor + totalFeeTallerea) {
      throw new Error(
        `[FINANCE ALERT] Descuadre pre-liquidación: ${totalBruto} ≠ ${totalProfesor} + ${totalFeeTallerea}`
      )
    }

    // Verificar mínimo de liquidación según modo
    let liquidacionMinima = 0
    const liquidationData: Record<string, unknown> = {
      periodo: { desde, hasta },
      breakdowns: breakdowns.map(b => b._id),
      totalBruto,
      totalFeeTallerea,
      totalProfesor,
      cantidadPagos: breakdowns.length,
      estado: 'pendiente',
    }

    if (mode === 'ownerId') {
      const user = await User.findById(subjectId).select('taller.liquidacionMinima').lean<{ taller?: { liquidacionMinima?: number } }>()
      liquidacionMinima = user?.taller?.liquidacionMinima ?? 0
      liquidationData.ownerId = subjectId
      liquidationData.accountId = subjectId  // mantener legacy por compatibilidad con Liquidation model
    } else {
      const account = await Account.findById(subjectId)
      liquidacionMinima = account?.liquidacionMinima ?? 0
      liquidationData.accountId = subjectId
    }

    if (totalProfesor < liquidacionMinima) {
      throw new Error(
        `Monto a liquidar ($${totalProfesor}) inferior al mínimo ($${liquidacionMinima})`
      )
    }

    const liquidation = await new Liquidation(liquidationData).save()

    // Marcar breakdowns como liquidados
    await PaymentBreakdown.updateMany(
      { _id: { $in: breakdowns.map(b => b._id) } },
      { estado: 'liquidado', liquidationId: liquidation._id }
    )

    // Audit log
    await FinanceService.log(
      'liquidacion_creada',
      'Liquidation',
      String(liquidation._id),
      totalProfesor,
      userId
    )

    return liquidation
  },

  // [LIQUIDACION] Marcar como pagada con doble verificación
  async markAsPaid(
    liquidationId: string,
    userId: string,
    comprobanteUrl?: string
  ): Promise<ILiquidation> {
    await dbConnect()

    const liquidation = await Liquidation.findById(liquidationId)
    if (!liquidation) throw new Error('Liquidación no encontrada')
    if (liquidation.estado === 'pagada') throw new Error('Liquidación ya fue pagada')

    // Doble verificación: recalcular desde breakdowns
    const breakdowns = await PaymentBreakdown.find({
      _id: { $in: liquidation.breakdowns },
    })

    const sumReal = breakdowns.reduce((acc, b) => acc + b.montoProfesor, 0)
    if (sumReal !== liquidation.totalProfesor) {
      throw new Error(
        `[FINANCE ALERT] Descuadre en liquidación ${liquidationId}: ` +
        `calculado=${sumReal} vs declarado=${liquidation.totalProfesor}`
      )
    }

    liquidation.estado = 'pagada'
    liquidation.fechaPago = new Date()
    if (comprobanteUrl) liquidation.comprobanteUrl = comprobanteUrl
    await liquidation.save()

    // Audit log
    await FinanceService.log(
      'liquidacion_pagada',
      'Liquidation',
      String(liquidation._id),
      liquidation.totalProfesor,
      userId
    )

    return liquidation
  },

  // Generar CSV bancario para pago masivo
  async generateCsv(liquidationIds: string[]): Promise<string> {
    await dbConnect()

    const rows: CsvRow[] = []

    for (const id of liquidationIds) {
      const liq = await Liquidation.findById(id)
        .populate('accountId')
        .lean<{ estado: string; ownerId?: string; accountId?: unknown; totalProfesor: number; periodo: { desde: Date | string } }>()
      if (!liq) continue
      if (liq.estado === 'pagada') continue

      let db: { rutTitular: string; nombreTitular: string; banco: string; tipoCuenta: string; numeroCuenta: string } | undefined

      // Flujo nuevo: buscar datos bancarios en User.taller
      if (liq.ownerId) {
        const user = await User.findById(liq.ownerId).select('taller.datosBancarios').lean<{ taller?: { datosBancarios?: { rutTitular: string; nombreTitular: string; banco: string; tipoCuenta: string; numeroCuenta: string } } }>()
        db = user?.taller?.datosBancarios
      } else {
        // Flujo legacy: Account.datosBancarios
        const account = liq.accountId as unknown as { datosBancarios?: typeof db }
        db = account?.datosBancarios
      }

      if (!db) continue

      rows.push({
        rut: db.rutTitular,
        nombre: db.nombreTitular,
        banco: db.banco,
        tipoCuenta: db.tipoCuenta,
        numeroCuenta: db.numeroCuenta,
        monto: liq.totalProfesor,
        glosa: `Tallerea liquidación ${liq.periodo.desde instanceof Date ? liq.periodo.desde.toISOString().slice(0, 10) : String(liq.periodo.desde).slice(0, 10)}`,
      })
    }

    if (rows.length === 0) throw new Error('No hay liquidaciones válidas para exportar (verifique datos bancarios)')

    const header = 'RUT;Nombre;Banco;TipoCuenta;NroCuenta;Monto;Glosa'
    const lines = rows.map(r =>
      `${r.rut};${r.nombre};${r.banco};${r.tipoCuenta};${r.numeroCuenta};${r.monto};${r.glosa}`
    )
    return [header, ...lines].join('\n')
  },
}
