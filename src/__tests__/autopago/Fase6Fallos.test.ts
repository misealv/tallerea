/**
 * Fase 6 — Pago automático: manejo de fallos y ciclo de vida.
 * Cubre:
 *  - handleRejectedRecurringPayment: incrementa intentosCobroFallidos
 *  - handleRejectedRecurringPayment: degrada a manual al alcanzar maxIntentos
 *  - handleRejectedRecurringPayment: no corta acceso si hay sesiones disponibles
 *  - desactivarPagoAutomatico (cancelación alumno): limpia mandato localmente
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'

vi.mock('@/lib/mercadopago', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/mercadopago')>()
  return {
    ...original,
    createPreapproval:       vi.fn(),
    updatePreapproval:       vi.fn(),
    cancelPreapproval:       vi.fn().mockResolvedValue({ id: 'pre_123', status: 'cancelled', external_reference: 'pa:sub' }),
    getPreapproval:          vi.fn(),
    pausePreapproval:        vi.fn().mockResolvedValue({ id: 'pre_123', status: 'paused',    external_reference: 'pa:sub' }),
    reactivatePreapproval:   vi.fn().mockResolvedValue({ id: 'pre_123', status: 'authorized', external_reference: 'pa:sub' }),
  }
})

vi.mock('@/lib/resend', () => ({
  sendCobroFallido:             vi.fn().mockResolvedValue(undefined),
  sendCobroFallidoMaxIntentos:  vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/services/SiteConfigService', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/SiteConfigService')>()
  return {
    SiteConfigService: {
      ...original.SiteConfigService,
      get:              vi.fn().mockResolvedValue({ comisionPct: 10, maxIntentosCobroFallido: 3 }),
      getComisionPct:   vi.fn().mockResolvedValue(10),
      resolverPoliticaRollover: vi.fn().mockResolvedValue({
        rolloverActivo: true,
        rolloverSoloAutopago: true,
        topeAcumulacionFactor: 2,
        mesesGraciaAlCancelar: 6,
        maxReservasSimultaneas: 4,
      }),
    },
  }
})

import { PaymentService } from '@/services/PaymentService'
import { SubscriptionService } from '@/services/SubscriptionService'
import { cancelPreapproval, pausePreapproval, reactivatePreapproval } from '@/lib/mercadopago'
import { sendCobroFallido, sendCobroFallidoMaxIntentos } from '@/lib/resend'
import User from '@/models/User'
import Workshop from '@/models/Workshop'
import Subscription from '@/models/Subscription'

let mongo: MongoMemoryReplSet

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  process.env.MONGODB_URI = mongo.getUri()
  await mongoose.connect(mongo.getUri())
})
afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
  delete process.env.MONGODB_URI
})
afterEach(async () => {
  vi.clearAllMocks()
  await mongoose.connection.dropDatabase()
})

async function crearDatos(opts: { intentosPrevios?: number; sesionesDisponibles?: number } = {}) {
  const owner = await User.create({ email: 'owner@test.cl', name: 'Owner' })
  const student = await User.create({ email: 'alumno@test.cl', name: 'Alumno' })
  const workshop = await Workshop.create({
    ownerId: owner._id,
    titulo: 'Taller Cerámica',
    descripcion: 'Desc',
    slug: `ceramica-${Date.now()}`,
    estado: 'publicado',
    tipo: 'ceramica',
    modalidad: 'presencial',
    modeloAcceso: 'puntual',
    modalidadPrecio: 'gratuito',
    precio: 0,
    fechaInicio: new Date(),
    activo: true,
    plan: { sesionesIncluidas: 4, vigencia: 'mensual' },
  })
  const sub = await Subscription.create({
    workshopId: workshop._id,
    studentId: student._id,
    estado: 'activa',
    sesionesTotales: 4,
    sesionesUsadas: 0,
    sesionesDisponibles: opts.sesionesDisponibles ?? 2,
    fechaCompra: new Date(),
    fechaVencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    monto: 15000,
    autoRenovar: false,
    pagoAutomatico: true,
    mpPreapprovalId: 'pre_123',
    mpPreapprovalStatus: 'authorized',
    cardLast4: '1234',
    intentosCobroFallidos: opts.intentosPrevios ?? 0,
    activo: true,
  })
  return { owner, student, workshop, sub }
}

describe('handleRejectedRecurringPayment', () => {
  it('incrementa intentosCobroFallidos y envía email de aviso', async () => {
    const { sub } = await crearDatos()

    await PaymentService.handleRejectedRecurringPayment(String(sub._id), 'ap_001')

    const updated = await Subscription.findById(sub._id).lean<typeof sub>()
    expect(updated?.intentosCobroFallidos).toBe(1)
    expect(updated?.pagoAutomatico).toBe(true)  // no degrada todavía
    expect(updated?.estado).toBe('activa')
    expect(sendCobroFallido).toHaveBeenCalledOnce()
    expect(sendCobroFallidoMaxIntentos).not.toHaveBeenCalled()
    expect(cancelPreapproval).not.toHaveBeenCalled()
  })

  it('degrada a manual al alcanzar maxIntentos', async () => {
    const { sub } = await crearDatos({ intentosPrevios: 2 })

    await PaymentService.handleRejectedRecurringPayment(String(sub._id), 'ap_002')

    const updated = await Subscription.findById(sub._id).lean<typeof sub>()
    expect(updated?.intentosCobroFallidos).toBe(3)
    expect(updated?.pagoAutomatico).toBe(false)
    expect(updated?.mpPreapprovalId).toBeUndefined()
    expect(updated?.mpPreapprovalStatus).toBeUndefined()
    expect(updated?.cardLast4).toBeUndefined()
    // Conserva acceso: tiene sesiones disponibles → no pasa a pendiente_pago
    expect(updated?.estado).toBe('activa')
    expect(sendCobroFallidoMaxIntentos).toHaveBeenCalledOnce()
    expect(cancelPreapproval).toHaveBeenCalledWith('pre_123')
  })

  it('pasa a pendiente_pago al degradar si no hay sesiones disponibles', async () => {
    const { sub } = await crearDatos({ intentosPrevios: 2, sesionesDisponibles: 0 })

    await PaymentService.handleRejectedRecurringPayment(String(sub._id), 'ap_003')

    const updated = await Subscription.findById(sub._id).lean<typeof sub>()
    expect(updated?.estado).toBe('pendiente_pago')
  })

  it('es idempotente: sub inexistente no lanza error', async () => {
    await expect(
      PaymentService.handleRejectedRecurringPayment(new mongoose.Types.ObjectId().toString(), 'ap_999')
    ).resolves.not.toThrow()
  })
})

describe('pausarPagoAutomatico / reactivarPagoAutomatico', () => {
  it('pausa y reactiva el mandato correctamente', async () => {
    const { sub } = await crearDatos()

    await SubscriptionService.pausarPagoAutomatico(String(sub._id))
    expect(pausePreapproval).toHaveBeenCalledWith('pre_123')
    const paused = await Subscription.findById(sub._id).lean<typeof sub>()
    expect(paused?.mpPreapprovalStatus).toBe('paused')

    await SubscriptionService.reactivarPagoAutomatico(String(sub._id))
    expect(reactivatePreapproval).toHaveBeenCalledWith('pre_123')
    const reactivated = await Subscription.findById(sub._id).lean<typeof sub>()
    expect(reactivated?.mpPreapprovalStatus).toBe('authorized')
    expect(reactivated?.intentosCobroFallidos).toBe(0)
  })
})

describe('desactivarPagoAutomatico (cancelación alumno)', () => {
  it('cancela en MP y limpia los campos del mandato', async () => {
    const { sub } = await crearDatos()

    await SubscriptionService.desactivarPagoAutomatico(String(sub._id))

    expect(cancelPreapproval).toHaveBeenCalledWith('pre_123')
    const updated = await Subscription.findById(sub._id).lean<typeof sub>()
    expect(updated?.pagoAutomatico).toBe(false)
    expect(updated?.mpPreapprovalId).toBeUndefined()
    expect(updated?.cardLast4).toBeUndefined()
    // La sub sigue activa
    expect(updated?.estado).toBe('activa')
  })
})
