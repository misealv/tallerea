import dbConnect from '@/lib/db'
import mongoose from 'mongoose'
import FinanceAuditLog from '@/models/FinanceAuditLog'
import type { AuditAction } from '@/models/FinanceAuditLog'

export interface DesgloseResult {
  montoBruto: number
  feeTallerea: number
  montoProfesor: number
}

export const FinanceService = {

  // [FINANCE RISK] Única fuente de cálculo de comisión
  calcularDesglose(montoBruto: number, comisionPct: number): DesgloseResult {
    if (!Number.isInteger(montoBruto) || montoBruto <= 0) {
      throw new Error('[FINANCE] Monto bruto debe ser entero positivo')
    }
    if (comisionPct < 0 || comisionPct > 100) {
      throw new Error('[FINANCE] Comisión fuera de rango (0-100)')
    }
    const feeTallerea = Math.round(montoBruto * comisionPct / 100)
    const montoProfesor = montoBruto - feeTallerea
    return { montoBruto, feeTallerea, montoProfesor }
  },

  // Calcular precio al alumno desde precio neto del profesor
  calcularPrecioDesdeNeto(precioProfesor: number, comisionPct: number): number {
    if (!Number.isInteger(precioProfesor) || precioProfesor <= 0) {
      throw new Error('[FINANCE] Precio profesor debe ser entero positivo')
    }
    return Math.round(precioProfesor / (1 - comisionPct / 100))
  },

  // Audit log — append-only
  async log(
    accion: AuditAction,
    entidadTipo: 'PaymentBreakdown' | 'Liquidation',
    entidadId: string,
    montoNuevo: number,
    userId: string,
    montoAnterior = 0,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await dbConnect()
    await new FinanceAuditLog({
      accion,
      entidadTipo,
      entidadId,
      montoAnterior,
      montoNuevo,
      userId,
      metadata,
    }).save()
  },

  // Audit log dentro de una transacción Mongoose — llamar desde dentro de withTransaction()
  async logWithSession(
    session: mongoose.ClientSession,
    accion: AuditAction,
    entidadTipo: 'PaymentBreakdown' | 'Liquidation',
    entidadId: string,
    montoNuevo: number,
    userId: string,
    montoAnterior = 0,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await FinanceAuditLog.create([{
      accion,
      entidadTipo,
      entidadId,
      montoAnterior,
      montoNuevo,
      userId,
      metadata,
    }], { session })
  },
}
