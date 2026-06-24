/**
 * Fase 1 – Pago automático: tests de los campos nuevos en Subscription y SiteConfig.
 * Verifica defaults, validaciones de dominio y unicidad de mpPreapprovalId.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import Subscription from '../../models/Subscription'
import SiteConfig from '../../models/SiteConfig'

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongod.getUri()
  const { default: dbConnect } = await import('@/lib/db')
  await dbConnect()
  // Asegurar índices en memoria antes de los tests de unicidad
  await Subscription.syncIndexes()
  await SiteConfig.syncIndexes()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
  delete process.env.MONGODB_URI
})

afterEach(async () => {
  const cols = mongoose.connection.collections
  for (const key in cols) await cols[key].deleteMany({})
})

// ────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────
function baseSubscription(overrides = {}) {
  return {
    workshopId:         new mongoose.Types.ObjectId(),
    studentId:          new mongoose.Types.ObjectId(),
    periodoInicio:      new Date(),
    periodoFin:         new Date(Date.now() + 30 * 86_400_000),
    fechaVencimiento:   new Date(Date.now() + 30 * 86_400_000),
    sesionesTotales:    4,
    sesionesDisponibles: 4,
    monto:              10000,
    estado:             'activa',
    modeloAcceso:       'recurrente',
    ...overrides,
  }
}

// ────────────────────────────────────────────────────
// Subscription: campos nuevos y defaults
// ────────────────────────────────────────────────────
describe('Subscription — campos de pago automático', () => {

  it('pagoAutomatico default false', async () => {
    const doc = await Subscription.create(baseSubscription())
    expect(doc.pagoAutomatico).toBe(false)
  })

  it('intentosCobroFallidos default 0', async () => {
    const doc = await Subscription.create(baseSubscription())
    expect(doc.intentosCobroFallidos).toBe(0)
  })

  it('acepta pagoAutomatico=true con campos asociados', async () => {
    const doc = await Subscription.create(baseSubscription({
      pagoAutomatico:          true,
      mpPreapprovalId:         'pre_test_001',
      mpPreapprovalStatus:     'authorized',
      cardLast4:               '4321',
      ultimoCobroAutomaticoEn: new Date(),
      intentosCobroFallidos:   0,
    }))
    expect(doc.pagoAutomatico).toBe(true)
    expect(doc.mpPreapprovalId).toBe('pre_test_001')
    expect(doc.mpPreapprovalStatus).toBe('authorized')
    expect(doc.cardLast4).toBe('4321')
    expect(doc.ultimoCobroAutomaticoEn).toBeInstanceOf(Date)
  })

  it('rechaza mpPreapprovalStatus fuera del enum', async () => {
    await expect(
      Subscription.create(baseSubscription({ mpPreapprovalStatus: 'invalid_status' }))
    ).rejects.toThrow()
  })

  it('mpPreapprovalId único: rechaza duplicado', async () => {
    const id = 'pre_unique_test'
    await Subscription.create(baseSubscription({ mpPreapprovalId: id }))
    await expect(
      Subscription.create(baseSubscription({ mpPreapprovalId: id }))
    ).rejects.toThrow()
  })

  it('mpPreapprovalId sparse: dos docs sin campo coexisten', async () => {
    // Sin mpPreapprovalId los dos deben crearse (sparse = null no viola unique)
    const a = await Subscription.create(baseSubscription())
    const b = await Subscription.create(baseSubscription())
    expect(a._id).not.toEqual(b._id)
  })

})

// ────────────────────────────────────────────────────
// SiteConfig: campos nuevos y defaults
// ────────────────────────────────────────────────────
describe('SiteConfig — campos de pago automático', () => {

  it('descuentoPagoAutomaticoPct default 5', async () => {
    const doc = await SiteConfig.create({ singleton: true })
    expect(doc.descuentoPagoAutomaticoPct).toBe(5)
    await doc.deleteOne()
  })

  it('avisoPreCobroDias default 3', async () => {
    const doc = await SiteConfig.create({ singleton: true })
    expect(doc.avisoPreCobroDias).toBe(3)
    await doc.deleteOne()
  })

  it('maxIntentosCobroFallido default 3', async () => {
    const doc = await SiteConfig.create({ singleton: true })
    expect(doc.maxIntentosCobroFallido).toBe(3)
    await doc.deleteOne()
  })

  it('rechaza descuentoPagoAutomaticoPct > 100', async () => {
    await expect(
      SiteConfig.create({ singleton: true, descuentoPagoAutomaticoPct: 150 })
    ).rejects.toThrow()
  })

  it('rechaza maxIntentosCobroFallido < 1', async () => {
    await expect(
      SiteConfig.create({ singleton: true, maxIntentosCobroFallido: 0 })
    ).rejects.toThrow()
  })

  it('acepta valores válidos personalizados', async () => {
    const doc = await SiteConfig.create({
      singleton: true,
      descuentoPagoAutomaticoPct: 10,
      avisoPreCobroDias: 5,
      maxIntentosCobroFallido: 5,
    })
    expect(doc.descuentoPagoAutomaticoPct).toBe(10)
    expect(doc.avisoPreCobroDias).toBe(5)
    expect(doc.maxIntentosCobroFallido).toBe(5)
    await doc.deleteOne()
  })

})
