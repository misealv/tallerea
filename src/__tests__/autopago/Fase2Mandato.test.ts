/**
 * Fase 2 — Pago automático: tests del mandato preapproval.
 * MercadoPago se mockea completamente (sin llamadas de red).
 * Cubre: activar (éxito), activar (token inválido), activar (sub inactiva),
 *        desactivar (éxito), desactivar (sin mandato),
 *        adminUpdate + sync de precio al MP,
 *        updatePreapproval (fallo de red no bloqueante).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

// ─────────────────────────────────────────────────────────────────
// Mock de MP al top level — intercepta tanto static como dynamic imports.
// Las implementaciones concretas se configuran por test con vi.mocked().
// ─────────────────────────────────────────────────────────────────
vi.mock('@/lib/mercadopago', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/mercadopago')>()
  return {
    ...original,
    createPreapproval: vi.fn(),
    updatePreapproval: vi.fn(),
    cancelPreapproval: vi.fn(),
  }
})

import {
  createPreapproval as mockCreatePreapproval,
  updatePreapproval as mockUpdatePreapproval,
  cancelPreapproval as mockCancelPreapproval,
} from '@/lib/mercadopago'

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongod.getUri()
  process.env.NEXTAUTH_URL = 'http://localhost:3000'
  const { default: dbConnect } = await import('@/lib/db')
  await dbConnect()
  const Subscription = (await import('@/models/Subscription')).default
  await Subscription.syncIndexes()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
  delete process.env.MONGODB_URI
})

afterEach(async () => {
  const cols = mongoose.connection.collections
  for (const key in cols) await cols[key].deleteMany({})
  // Resetear implementaciones pero mantener los stubs (vi.fn())
  vi.resetAllMocks()
})

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
async function crearSubActiva(overrides = {}) {
  const Subscription = (await import('@/models/Subscription')).default
  const Workshop = (await import('@/models/Workshop')).default
  const User = (await import('@/models/User')).default

  const alumno = await User.create({
    name: 'Alumno Test',
    email: `test-${Date.now()}@mail.com`,
    role: 'user',
  })
  const tallerista = await User.create({
    name: 'Tallerista Test',
    email: `tallerista-${Date.now()}@mail.com`,
    role: 'user',
  })
  const workshop = await Workshop.create({
    ownerId: tallerista._id,
    titulo: 'Taller de prueba Fase 2',
    slug: `taller-f2-${Date.now()}`,
    descripcion: 'Taller para test',
    tipo: 'visual',
    categoria: 'pintura',
    modalidad: 'presencial',
    modeloAcceso: 'puntual',
    modalidadPrecio: 'gratuito',  // evita validaciones de precioFijo/paquetes
    precio: 0,
    activo: true,
    fechaInicio: new Date(),
  })
  const sub = await Subscription.create({
    workshopId: workshop._id,
    studentId: alumno._id,
    periodoInicio: new Date(),
    periodoFin: new Date(Date.now() + 30 * 86_400_000),
    fechaVencimiento: new Date(Date.now() + 30 * 86_400_000),
    sesionesTotales: 4,
    sesionesDisponibles: 4,
    monto: 20000,
    precioSnapshot: 20000,
    estado: 'activa',
    modeloAcceso: 'recurrente',
    ...overrides,
  })
  return { sub, alumno, workshop }
}

const MP_OK = { id: 'pre_mock_123', status: 'authorized', external_reference: 'pa:mock' }
const MP_CANCELLED = { id: 'pre_to_cancel', status: 'cancelled', external_reference: 'pa:x' }

// ─────────────────────────────────────────────────────────────────
// activarPagoAutomatico
// ─────────────────────────────────────────────────────────────────
describe('activarPagoAutomatico', () => {

  it('activa mandato y persiste campos en la sub (éxito)', async () => {
    const { sub } = await crearSubActiva()
    vi.mocked(mockCreatePreapproval).mockResolvedValue(MP_OK)
    const { SubscriptionService } = await import('@/services/SubscriptionService')

    const result = await SubscriptionService.activarPagoAutomatico(
      String(sub._id), 'tok_test_ok', '1234'
    )

    expect(result.pagoAutomatico).toBe(true)
    expect(result.mpPreapprovalId).toBe('pre_mock_123')
    expect(result.mpPreapprovalStatus).toBe('authorized')
    expect(result.cardLast4).toBe('1234')
  })

  it('rechaza si la sub no está activa', async () => {
    const { sub } = await crearSubActiva({ estado: 'vencida' })
    const { SubscriptionService } = await import('@/services/SubscriptionService')

    await expect(
      SubscriptionService.activarPagoAutomatico(String(sub._id), 'tok', '1234')
    ).rejects.toThrow('Solo se puede activar auto-pago en suscripciones activas')
  })

  it('rechaza si ya está activo', async () => {
    const { sub } = await crearSubActiva({ pagoAutomatico: true, mpPreapprovalId: 'pre_existing' })
    const { SubscriptionService } = await import('@/services/SubscriptionService')

    await expect(
      SubscriptionService.activarPagoAutomatico(String(sub._id), 'tok', '1234')
    ).rejects.toThrow('ya está activo')
  })

  it('rechaza cardLast4 con formato inválido', async () => {
    const { sub } = await crearSubActiva()
    const { SubscriptionService } = await import('@/services/SubscriptionService')

    await expect(
      SubscriptionService.activarPagoAutomatico(String(sub._id), 'tok', 'abc')
    ).rejects.toThrow('cardLast4 debe tener exactamente 4 dígitos')
  })

  it('propaga el error cuando MP rechaza el token (token inválido)', async () => {
    const { sub } = await crearSubActiva()
    vi.mocked(mockCreatePreapproval).mockRejectedValue(
      new Error('[MP] createPreapproval error 400: invalid card token')
    )
    const { SubscriptionService } = await import('@/services/SubscriptionService')

    await expect(
      SubscriptionService.activarPagoAutomatico(String(sub._id), 'tok_invalid', '9999')
    ).rejects.toThrow('[MP] createPreapproval error 400')
  })

  it('no persiste cambios si MP falla (rollback de estado)', async () => {
    const { sub } = await crearSubActiva()
    const Subscription = (await import('@/models/Subscription')).default
    vi.mocked(mockCreatePreapproval).mockRejectedValue(new Error('fallo de red'))
    const { SubscriptionService } = await import('@/services/SubscriptionService')

    await expect(
      SubscriptionService.activarPagoAutomatico(String(sub._id), 'tok', '5678')
    ).rejects.toThrow()

    const unchanged = await Subscription.findById(sub._id).lean<{ pagoAutomatico?: boolean; mpPreapprovalId?: string }>()
    expect(unchanged?.pagoAutomatico).toBeFalsy()
    expect(unchanged?.mpPreapprovalId).toBeUndefined()
  })

})

// ─────────────────────────────────────────────────────────────────
// desactivarPagoAutomatico
// ─────────────────────────────────────────────────────────────────
describe('desactivarPagoAutomatico', () => {

  it('cancela mandato y limpia flags', async () => {
    const { sub } = await crearSubActiva({
      pagoAutomatico: true,
      mpPreapprovalId: 'pre_to_cancel',
      mpPreapprovalStatus: 'authorized',
      cardLast4: '0001',
    })
    vi.mocked(mockCancelPreapproval).mockResolvedValue(MP_CANCELLED)
    const { SubscriptionService } = await import('@/services/SubscriptionService')

    const result = await SubscriptionService.desactivarPagoAutomatico(String(sub._id))

    expect(result.pagoAutomatico).toBe(false)
    expect(result.mpPreapprovalId).toBeUndefined()
    expect(result.mpPreapprovalStatus).toBeUndefined()
    expect(result.cardLast4).toBeUndefined()
    expect(result.intentosCobroFallidos).toBe(0)
  })

  it('limpia flags localmente aunque MP devuelva error (tolerante a fallos)', async () => {
    const { sub } = await crearSubActiva({
      pagoAutomatico: true,
      mpPreapprovalId: 'pre_already_gone',
      mpPreapprovalStatus: 'cancelled',
    })
    vi.mocked(mockCancelPreapproval).mockRejectedValue(new Error('[MP] cancelPreapproval error 404'))
    const { SubscriptionService } = await import('@/services/SubscriptionService')

    const result = await SubscriptionService.desactivarPagoAutomatico(String(sub._id))
    expect(result.pagoAutomatico).toBe(false)
  })

  it('rechaza si no hay mandato activo', async () => {
    const { sub } = await crearSubActiva()
    const { SubscriptionService } = await import('@/services/SubscriptionService')

    await expect(
      SubscriptionService.desactivarPagoAutomatico(String(sub._id))
    ).rejects.toThrow('no tiene pago automático activo')
  })

})

// ─────────────────────────────────────────────────────────────────
// adminUpdate: sincronización de precio con MP
// ─────────────────────────────────────────────────────────────────
describe('adminUpdate + sincronización de precio', () => {

  it('[FINANCE RISK] llama updatePreapproval cuando cambia precioSnapshot con mandato activo', async () => {
    const { sub } = await crearSubActiva({
      pagoAutomatico: true,
      mpPreapprovalId: 'pre_sync_test',
      mpPreapprovalStatus: 'authorized',
    })
    vi.mocked(mockUpdatePreapproval).mockResolvedValue({ id: 'pre_sync_test', status: 'authorized', external_reference: 'pa:x' })
    const { SubscriptionService } = await import('@/services/SubscriptionService')

    const result = await SubscriptionService.adminUpdate(String(sub._id), { precioSnapshot: 25000 })

    expect(result.precioSnapshot).toBe(25000)
    expect(vi.mocked(mockUpdatePreapproval)).toHaveBeenCalledWith('pre_sync_test', 25000)
  })

  it('no llama updatePreapproval si el precio no cambia', async () => {
    const { sub } = await crearSubActiva({
      pagoAutomatico: true,
      mpPreapprovalId: 'pre_no_update',
      precioSnapshot: 20000,
    })
    const { SubscriptionService } = await import('@/services/SubscriptionService')

    await SubscriptionService.adminUpdate(String(sub._id), { precioSnapshot: 20000 })

    expect(vi.mocked(mockUpdatePreapproval)).not.toHaveBeenCalled()
  })

  it('[FINANCE RISK] fallo en updatePreapproval no bloquea el guardado de la sub', async () => {
    const { sub } = await crearSubActiva({
      pagoAutomatico: true,
      mpPreapprovalId: 'pre_fail',
      mpPreapprovalStatus: 'authorized',
    })
    vi.mocked(mockUpdatePreapproval).mockRejectedValue(new Error('fallo de red MP'))
    const { SubscriptionService } = await import('@/services/SubscriptionService')

    // No debe lanzar error; el precioSnapshot se guarda igual
    const result = await SubscriptionService.adminUpdate(String(sub._id), { precioSnapshot: 30000 })
    expect(result.precioSnapshot).toBe(30000)
  })

})
