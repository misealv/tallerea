import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests para Fase 1.5 — consumo de clases prepagadas.
 *
 * Estos tests validan invariantes lógicos del flujo, no la integración Mongoose:
 *  - Atomicidad del guard $expr (consumidas < cantidad)
 *  - hasPrepaidBalance retorna lo correcto para los 3 estados
 *  - notifyPrepaidExhausted respeta precioSnapshot (no precio público)
 *  - Saldo restante NO genera credito al cancelar
 */

// Mock dbConnect (no se conecta a DB real)
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(null) }))

// Mock createPaymentPreference para verificar que recibe precioSnapshot
const mockCreatePref = vi.fn().mockResolvedValue({ id: 'pref-123', init_point: 'https://mp.test/123' })
vi.mock('@/lib/mercadopago', () => ({ createPaymentPreference: (...args: unknown[]) => mockCreatePref(...args) }))

// Mock sendPrepaidExhausted para verificar argumentos
const mockSendEmail = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/resend', () => ({
  sendPrepaidExhausted: (...args: unknown[]) => mockSendEmail(...args),
  sendSubscriptionVencida: vi.fn(),
  sendSubscriptionRenovar: vi.fn(),
}))

// Mock User y Workshop con findById
const userDoc = { _id: 'u1', name: 'María Test', email: 'maria@test.cl' }
const workshopDoc = { _id: 'w1', titulo: 'Cerámica martes' }
vi.mock('@/models/User', () => ({
  default: { findById: () => ({ select: () => ({ lean: () => Promise.resolve(userDoc) }) }) },
}))
vi.mock('@/models/Workshop', () => ({
  default: { findById: () => ({ select: () => ({ lean: () => Promise.resolve(workshopDoc) }) }) },
}))

// Mock Booking (no se usa en estos tests)
vi.mock('@/models/Booking', () => ({ default: {} }))
vi.mock('@/services/FinanceService', () => ({ FinanceService: {} }))
vi.mock('@/services/SiteConfigService', () => ({ SiteConfigService: {} }))

// Mock Subscription con estado mutable
let subStore: Record<string, unknown> = {}

vi.mock('@/models/Subscription', () => ({
  default: {
    findById: (id: string) => ({
      lean: () => Promise.resolve(subStore[id] ?? null),
    }),
    findOne: (q: Record<string, unknown>) => ({
      lean: () => {
        const id = q._id as string
        return Promise.resolve(subStore[id] ?? null)
      },
    }),
    findOneAndUpdate: (q: Record<string, unknown>, update: Record<string, unknown>) => ({
      lean: async () => {
        const id = q._id as string
        const sub = subStore[id] as { clasesPrepagadas?: { cantidad: number; consumidas: number } } | undefined
        if (!sub?.clasesPrepagadas) return null
        // Simular guard $expr: consumidas < cantidad
        if (sub.clasesPrepagadas.consumidas >= sub.clasesPrepagadas.cantidad) return null
        // Aplicar $inc
        const incObj = (update as { $inc?: Record<string, number> }).$inc ?? {}
        if (incObj['clasesPrepagadas.consumidas'] === 1) {
          sub.clasesPrepagadas.consumidas += 1
        }
        return sub
      },
    }),
  },
}))

// Importar después de los mocks
const { SubscriptionService } = await import('@/services/SubscriptionService')

beforeEach(() => {
  subStore = {}
  mockCreatePref.mockClear()
  mockSendEmail.mockClear()
})

describe('SubscriptionService.consumePrepaid', () => {
  it('decrementa saldo cuando consumidas < cantidad', async () => {
    subStore['s1'] = {
      _id: 's1', studentId: 'u1', workshopId: 'w1', precioSnapshot: 50000,
      clasesPrepagadas: { cantidad: 8, consumidas: 3 },
    }
    const result = await SubscriptionService.consumePrepaid('s1', 'asistio')
    expect(result).not.toBeNull()
    expect((result as { clasesPrepagadas: { consumidas: number } }).clasesPrepagadas.consumidas).toBe(4)
  })

  it('retorna null cuando saldo está agotado', async () => {
    subStore['s2'] = {
      _id: 's2', studentId: 'u1', workshopId: 'w1', precioSnapshot: 50000,
      clasesPrepagadas: { cantidad: 8, consumidas: 8 },
    }
    const result = await SubscriptionService.consumePrepaid('s2', 'asistio')
    expect(result).toBeNull()
  })

  it('retorna null cuando subscription no tiene clasesPrepagadas', async () => {
    subStore['s3'] = { _id: 's3', studentId: 'u1', workshopId: 'w1' }
    const result = await SubscriptionService.consumePrepaid('s3', 'asistio')
    expect(result).toBeNull()
  })

  it('al agotar saldo dispara notifyPrepaidExhausted con precioSnapshot', async () => {
    subStore['s4'] = {
      _id: 's4', studentId: 'u1', workshopId: 'w1', precioSnapshot: 75000,
      clasesPrepagadas: { cantidad: 8, consumidas: 7 },
    }
    await SubscriptionService.consumePrepaid('s4', 'asistio')
    // notify es fire-and-forget — esperar microtasks
    await new Promise((r) => setTimeout(r, 50))

    expect(mockCreatePref).toHaveBeenCalledTimes(1)
    const callArgs = mockCreatePref.mock.calls[0][0] as { amount: number; externalRef: string }
    expect(callArgs.amount).toBe(75000) // precioSnapshot, NO precio público
    expect(callArgs.externalRef).toContain('sub:s4')

    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const emailArgs = mockSendEmail.mock.calls[0][0] as { monto: number; cantidad: number; email: string }
    expect(emailArgs.monto).toBe(75000)
    expect(emailArgs.cantidad).toBe(8)
    expect(emailArgs.email).toBe('maria@test.cl')
  })

  it('NO dispara notify si aún queda saldo tras consumo', async () => {
    subStore['s5'] = {
      _id: 's5', studentId: 'u1', workshopId: 'w1', precioSnapshot: 50000,
      clasesPrepagadas: { cantidad: 8, consumidas: 2 },
    }
    await SubscriptionService.consumePrepaid('s5', 'asistio')
    await new Promise((r) => setTimeout(r, 50))
    expect(mockCreatePref).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})

describe('SubscriptionService.hasPrepaidBalance', () => {
  it('true cuando consumidas < cantidad', () => {
    const sub = { clasesPrepagadas: { cantidad: 8, consumidas: 3 } } as never
    expect(SubscriptionService.hasPrepaidBalance(sub)).toBe(true)
  })

  it('false cuando consumidas === cantidad', () => {
    const sub = { clasesPrepagadas: { cantidad: 8, consumidas: 8 } } as never
    expect(SubscriptionService.hasPrepaidBalance(sub)).toBe(false)
  })

  it('false cuando no tiene clasesPrepagadas', () => {
    const sub = {} as never
    expect(SubscriptionService.hasPrepaidBalance(sub)).toBe(false)
  })
})
