import { describe, it, expect, vi } from 'vitest'

// Mockeados para evitar conexión a MongoDB en tests unitarios
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/models/FinanceAuditLog', () => ({
  default: class { save = vi.fn().mockResolvedValue(undefined) },
}))

import { FinanceService } from '@/services/FinanceService'

// [CUADRATURA] Suite de tests financieros obligatorios — Principio #9
describe('FinanceService.calcularDesglose', () => {
  // --- Ecuación fundamental ---
  it('cumple montoBruto === montoProfesor + feeTallerea', () => {
    const r = FinanceService.calcularDesglose(25000, 15)
    expect(r.montoBruto).toBe(r.montoProfesor + r.feeTallerea)
  })

  it('devuelve los tres campos del desglose', () => {
    const r = FinanceService.calcularDesglose(10000, 10)
    expect(r).toHaveProperty('montoBruto')
    expect(r).toHaveProperty('feeTallerea')
    expect(r).toHaveProperty('montoProfesor')
  })

  // --- Comisión 0% ---
  it('comisión 0%: montoProfesor === montoBruto, feeTallerea === 0', () => {
    const r = FinanceService.calcularDesglose(30000, 0)
    expect(r.feeTallerea).toBe(0)
    expect(r.montoProfesor).toBe(30000)
  })

  // --- Comisión 100% ---
  it('comisión 100%: feeTallerea === montoBruto, montoProfesor === 0', () => {
    const r = FinanceService.calcularDesglose(30000, 100)
    expect(r.feeTallerea).toBe(30000)
    expect(r.montoProfesor).toBe(0)
  })

  // --- Monto mínimo CLP ---
  it('monto mínimo $1.000 con 15%: cuadra', () => {
    const r = FinanceService.calcularDesglose(1000, 15)
    expect(r.montoBruto).toBe(r.montoProfesor + r.feeTallerea)
    expect(r.montoBruto).toBe(1000)
  })

  // --- comisionMP NO entra en desglose ---
  it('resultado NO incluye comisionMP (separación de responsabilidades)', () => {
    const r = FinanceService.calcularDesglose(25000, 15)
    expect(r).not.toHaveProperty('comisionMP')
  })

  // --- Caso real: comisión 15% sobre $45.000 ---
  it('$45.000 al 15%: feeTallerea=6750, montoProfesor=38250', () => {
    const r = FinanceService.calcularDesglose(45000, 15)
    expect(r.feeTallerea).toBe(6750)
    expect(r.montoProfesor).toBe(38250)
    expect(r.montoBruto).toBe(r.montoProfesor + r.feeTallerea)
  })

  // --- Validaciones de entrada ---
  it('lanza error si montoBruto no es entero positivo (float)', () => {
    expect(() => FinanceService.calcularDesglose(25000.5, 15)).toThrow('[FINANCE]')
  })

  it('lanza error si montoBruto es 0', () => {
    expect(() => FinanceService.calcularDesglose(0, 15)).toThrow('[FINANCE]')
  })

  it('lanza error si montoBruto es negativo', () => {
    expect(() => FinanceService.calcularDesglose(-1000, 15)).toThrow('[FINANCE]')
  })

  it('lanza error si comisión es negativa', () => {
    expect(() => FinanceService.calcularDesglose(25000, -1)).toThrow('[FINANCE]')
  })

  it('lanza error si comisión supera 100', () => {
    expect(() => FinanceService.calcularDesglose(25000, 101)).toThrow('[FINANCE]')
  })
})

// [CUADRATURA] Precio desde neto
describe('FinanceService.calcularPrecioDesdeNeto', () => {
  it('sube el precio para cubrir la comisión', () => {
    const bruto = FinanceService.calcularPrecioDesdeNeto(38250, 15)
    expect(bruto).toBeGreaterThan(38250)
  })

  it('redondeo coherente: desglose desde resultado no genera descuadre', () => {
    const montoBruto = FinanceService.calcularPrecioDesdeNeto(38250, 15)
    const desglose = FinanceService.calcularDesglose(montoBruto, 15)
    expect(desglose.montoBruto).toBe(desglose.montoProfesor + desglose.feeTallerea)
  })

  it('lanza error si precioProfesor no es entero positivo', () => {
    expect(() => FinanceService.calcularPrecioDesdeNeto(0, 15)).toThrow('[FINANCE]')
  })
})
