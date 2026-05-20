import { describe, it, expect, vi, beforeAll } from 'vitest'

/**
 * Tests post-refactor Modelo A puro (2026-05).
 *
 * Cambio conceptual:
 *  - El saldo se descuenta UNA SOLA VEZ al crear el Booking (consumeSesion).
 *  - clasesPrepagadas.consumidas dejó de ser fuente de verdad → consumePrepaid es no-op.
 *  - hasPrepaidBalance ahora lee sesionesDisponibles > 0 (única fuente de verdad).
 */

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/mercadopago', () => ({ createPaymentPreference: vi.fn() }))
vi.mock('@/lib/resend', () => ({
  sendPrepaidExhausted: vi.fn(),
  sendSubscriptionVencida: vi.fn(),
  sendSubscriptionRenovar: vi.fn(),
}))
vi.mock('@/models/User', () => ({ default: {} }))
vi.mock('@/models/Workshop', () => ({ default: {} }))
vi.mock('@/models/Booking', () => ({ default: {} }))
vi.mock('@/models/Subscription', () => ({ default: {} }))
vi.mock('@/services/FinanceService', () => ({ FinanceService: {} }))
vi.mock('@/services/SiteConfigService', () => ({ SiteConfigService: {} }))

let SubscriptionService: typeof import('@/services/SubscriptionService')['SubscriptionService']
beforeAll(async () => {
  ;({ SubscriptionService } = await import('@/services/SubscriptionService'))
})

describe('SubscriptionService.consumePrepaid (DEPRECATED)', () => {
  it('siempre retorna null: el consumo real ocurre en consumeSesion al reservar', async () => {
    const result = await SubscriptionService.consumePrepaid('cualquier-id', 'asistio')
    expect(result).toBeNull()
  })
})

describe('SubscriptionService.hasPrepaidBalance', () => {
  it('true cuando sesionesDisponibles > 0 y no ha caducado', () => {
    const sub = {
      sesionesDisponibles: 5,
      clasesPrepagadas: { cantidad: 8, consumidas: 0 },
    } as never
    expect(SubscriptionService.hasPrepaidBalance(sub)).toBe(true)
  })

  it('false cuando sesionesDisponibles === 0 (fuente única)', () => {
    const sub = {
      sesionesDisponibles: 0,
      clasesPrepagadas: { cantidad: 8, consumidas: 0 },
    } as never
    expect(SubscriptionService.hasPrepaidBalance(sub)).toBe(false)
  })

  it('false cuando no tiene clasesPrepagadas', () => {
    const sub = { sesionesDisponibles: 5 } as never
    expect(SubscriptionService.hasPrepaidBalance(sub)).toBe(false)
  })

  it('false cuando clasesPrepagadas.caducaEn está vencida', () => {
    const sub = {
      sesionesDisponibles: 5,
      clasesPrepagadas: {
        cantidad: 8,
        consumidas: 0,
        caducaEn: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    } as never
    expect(SubscriptionService.hasPrepaidBalance(sub)).toBe(false)
  })
})
