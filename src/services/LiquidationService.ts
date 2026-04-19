import dbConnect from '@/lib/db'
import Liquidation, { ILiquidation } from '@/models/Liquidation'
import PaymentBreakdown from '@/models/PaymentBreakdown'
import Account from '@/models/Account'
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

  // Generar liquidación para un Account en un período
  async generate(
    accountId: string,
    desde: Date,
    hasta: Date,
    userId: string
  ): Promise<ILiquidation> {
    await dbConnect()

    // Buscar breakdowns cobrados no liquidados del período
    const breakdowns = await PaymentBreakdown.find({
      accountId,
      estado: 'cobrado',
      liquidationId: { $exists: false },
      fechaCobro: { $gte: desde, $lte: hasta },
    })

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

    // Verificar mínimo de liquidación
    const account = await Account.findById(accountId)
    if (account && totalProfesor < account.liquidacionMinima) {
      throw new Error(
        `Monto a liquidar ($${totalProfesor}) inferior al mínimo ($${account.liquidacionMinima})`
      )
    }

    const liquidation = await new Liquidation({
      accountId,
      periodo: { desde, hasta },
      breakdowns: breakdowns.map(b => b._id),
      totalBruto,
      totalFeeTallerea,
      totalProfesor,
      cantidadPagos: breakdowns.length,
      estado: 'pendiente',
    }).save()

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
      const liq = await Liquidation.findById(id).populate('accountId')
      if (!liq) continue
      if (liq.estado === 'pagada') continue

      const account = liq.accountId as unknown as {
        nombre: string
        datosBancarios?: {
          rutTitular: string
          nombreTitular: string
          banco: string
          tipoCuenta: string
          numeroCuenta: string
        }
      }

      if (!account.datosBancarios) continue

      rows.push({
        rut: account.datosBancarios.rutTitular,
        nombre: account.datosBancarios.nombreTitular,
        banco: account.datosBancarios.banco,
        tipoCuenta: account.datosBancarios.tipoCuenta,
        numeroCuenta: account.datosBancarios.numeroCuenta,
        monto: liq.totalProfesor,
        glosa: `Tallerea liquidación ${liq.periodo.desde.toISOString().slice(0, 10)}`,
      })
    }

    if (rows.length === 0) throw new Error('No hay liquidaciones válidas para exportar')

    const header = 'RUT;Nombre;Banco;TipoCuenta;NroCuenta;Monto;Glosa'
    const lines = rows.map(r =>
      `${r.rut};${r.nombre};${r.banco};${r.tipoCuenta};${r.numeroCuenta};${r.monto};${r.glosa}`
    )
    return [header, ...lines].join('\n')
  },
}
