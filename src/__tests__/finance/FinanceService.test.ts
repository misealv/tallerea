import { describe, it, expect } from 'vitest'
import { FinanceService } from '@/services/FinanceService'

describe('FinanceService.calcularDesglose', () => {
  // --- Casos estándar ---
  it('calcula desglose correcto con comisión 15%', () => {
    const r = FinanceService.calcularDesglose(45000, 15)
    expect(r.feeTallerea).toBe(6750)
    expect(r.montoProfesor).toBe(38250)
    expect(r.montoBruto).toBe(45000)
  })

  it('ecuación fundamental siempre cuadra', () => {
    const r = FinanceService.calcularDesglose(37000, 20)
    expect(r.montoBruto).toBe(r.montoProfesor + r.feeTallerea)
  })

  // --- Casos borde ---
  it('comisión 0% → feeTallerea=0, montoProfesor=montoBruto', () => {
    const r = FinanceService.calcularDesglose(50000, 0)
    expect(r.feeTallerea).toBe(0)
    expect(r.montoProfesor).toBe(50000)
  })

  it('comisión 100% → montoProfesor=0, feeTallerea=montoBruto', () => {
    const r = FinanceService.calcularDesglose(50000, 100)
    expect(r.montoProfesor).toBe(0)
    expect(r.feeTallerea).toBe(50000)
  })

  it('monto mínimo $1.000 funciona correctamente', () => {
    const r = FinanceService.calcularDesglose(1000, 10)
    expect(r.montoBruto).toBe(r.montoProfesor + r.feeTallerea)
    expect(r.montoBruto).toBe(1000)
  })

  it('redondeo correcto: no acumula error en cálculo', () => {
    // 10001 * 33% = 3300.33 → redondeado a 3300; montoProfesor=6701
    const r = FinanceService.calcularDesglose(10001, 33)
    expect(r.feeTallerea).toBe(Math.round(10001 * 33 / 100))
    expect(r.montoBruto).toBe(r.montoProfesor + r.feeTallerea)
  })

  // --- Errores esperados ---
  it('rechaza monto no entero', () => {
    expect(() => FinanceService.calcularDesglose(45000.5, 15)).toThrow('[FINANCE]')
  })

  it('rechaza monto negativo', () => {
    expect(() => FinanceService.calcularDesglose(-1000, 15)).toThrow('[FINANCE]')
  })

  it('rechaza monto cero', () => {
    expect(() => FinanceService.calcularDesglose(0, 15)).toThrow('[FINANCE]')
  })

  it('rechaza comisión negativa', () => {
    expect(() => FinanceService.calcularDesglose(50000, -1)).toThrow('[FINANCE]')
  })

  it('rechaza comisión mayor a 100', () => {
    expect(() => FinanceService.calcularDesglose(50000, 101)).toThrow('[FINANCE]')
  })
})

describe('FinanceService.calcularPrecioDesdeNeto', () => {
  it('calcula precio al alumno cuando el profesor fija su neto con 20%', () => {
    // Si profesor quiere 40000 y fee es 20%: precio = 40000 / (1 - 0.2) = 50000
    const precio = FinanceService.calcularPrecioDesdeNeto(40000, 20)
    expect(precio).toBe(50000)
  })

  it('precio ≥ neto siempre', () => {
    const precio = FinanceService.calcularPrecioDesdeNeto(38000, 15)
    expect(precio).toBeGreaterThanOrEqual(38000)
  })

  it('rechaza neto no entero', () => {
    expect(() => FinanceService.calcularPrecioDesdeNeto(38000.99, 15)).toThrow('[FINANCE]')
  })

  it('rechaza neto cero', () => {
    expect(() => FinanceService.calcularPrecioDesdeNeto(0, 15)).toThrow('[FINANCE]')
  })
})
