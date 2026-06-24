/**
 * Fase 4 — Pago automático: handlers de webhook + idempotencia.
 * Cubre:
 *  - handleAuthorizedRecurringPayment: idempotencia por mercadoPagoId
 *  - handleAuthorizedRecurringPayment: cuadratura (montoBruto = montoProfesor + feeTallerea)
 *  - handleAuthorizedRecurringPayment: acreditación de sesiones + extensión de fechaVencimiento
 *  - handlePreapprovalStatusUpdate: actualización de mpPreapprovalStatus
 *  - handlePreapprovalStatusUpdate: 'cancelled' → limpia pagoAutomatico
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'

// ─────────────────────────────────────────────────────────────────
// Mock de MP al top level — necesario por hoisting de vi.mock
// ─────────────────────────────────────────────────────────────────
vi.mock('@/lib/mercadopago', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/mercadopago')>()
  return {
    ...original,
    createPreapproval:       vi.fn(),
    updatePreapproval:       vi.fn(),
    cancelPreapproval:       vi.fn(),
    getPreapproval:          vi.fn(),
    getAuthorizedPayment:    vi.fn(),
  }
})

import {
  getPreapproval as mockGetPreapproval,
} from '@/lib/mercadopago'

// ─────────────────────────────────────────────────────────────────
// Mock de SiteConfigService para fijar comisión al 10%
// ─────────────────────────────────────────────────────────────────
vi.mock('@/services/SiteConfigService', () => ({
  SiteConfigService: {
    get:              vi.fn().mockResolvedValue({ comisionPct: 10 }),
    getComisionPct:   vi.fn().mockResolvedValue(10),
  },
}))

import { PaymentService } from '@/services/PaymentService'
import User from '@/models/User'
import Workshop from '@/models/Workshop'
import Subscription from '@/models/Subscription'
import PaymentBreakdown from '@/models/PaymentBreakdown'

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
  vi.clearAllMocks()  // limpia historial y cola de mockResolvedValueOnce, pero preserva implementaciones permanentes
  await mongoose.connection.dropDatabase()
})

// ─────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────
async function crearDatos(opts: { sesionesIniciales?: number; fechaVenc?: Date } = {}) {
  const owner = await User.create({ email: 'tallerista@test.cl', name: 'Taller Owner' })
  const student = await User.create({ email: 'alumno@test.cl', name: 'Alumno Test' })

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
    plan: { sesionesIncluidas: 4, vigencia: 'mensual' },
  })

  const venc = opts.fechaVenc ?? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
  const sub = await Subscription.create({
    workshopId: workshop._id,
    studentId: student._id,
    estado: 'activa',
    monto: 10000,
    periodoInicio: new Date(),
    periodoFin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    fechaVencimiento: venc,
    sesionesTotales: opts.sesionesIniciales ?? 4,
    sesionesDisponibles: opts.sesionesIniciales ?? 4,
    sesionesUsadas: 0,
    pagoAutomatico: true,
    mpPreapprovalId: 'prapp_123',
    mpPreapprovalStatus: 'authorized',
    cardLast4: '4242',
    intentosCobroFallidos: 0,
  })

  return { owner, student, workshop, sub }
}

// ─────────────────────────────────────────────────────────────────
// handleAuthorizedRecurringPayment
// ─────────────────────────────────────────────────────────────────
describe('handleAuthorizedRecurringPayment', () => {
  it('crea PaymentBreakdown con cuadratura montoBruto = montoProfesor + feeTallerea', async () => {
    const { sub } = await crearDatos()

    await PaymentService.handleAuthorizedRecurringPayment(
      String(sub._id),
      'ap_cuadratura_001',
      10000,  // CLP
      300,    // comisionMP informativa
    )

    const breakdown = await PaymentBreakdown.findOne({ mercadoPagoId: 'ap_cuadratura_001' })
    expect(breakdown).not.toBeNull()

    // [CUADRATURA] ecuación fundamental
    expect(breakdown!.montoBruto).toBe(breakdown!.montoProfesor + breakdown!.feeTallerea)

    // comisionMP es campo separado — no entra en la ecuación
    expect(breakdown!.comisionMP).toBe(300)
  })

  it('acredita sesionesIncluidas y extiende fechaVencimiento 1 mes', async () => {
    const vencOriginal = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    const { sub } = await crearDatos({ sesionesIniciales: 2, fechaVenc: vencOriginal })

    await PaymentService.handleAuthorizedRecurringPayment(
      String(sub._id),
      'ap_sesiones_001',
      8000,
      240,
    )

    const updated = await Subscription.findById(sub._id).lean<{ sesionesTotales: number; sesionesDisponibles: number; fechaVencimiento: Date; ultimoCobroAutomaticoEn: Date; intentosCobroFallidos: number }>()
    expect(updated!.sesionesTotales).toBe(6)       // 2 + 4 (plan.sesionesIncluidas)
    expect(updated!.sesionesDisponibles).toBe(6)
    expect(updated!.ultimoCobroAutomaticoEn).toBeTruthy()
    expect(updated!.intentosCobroFallidos).toBe(0)

    // fechaVencimiento debe estar ~1 mes después del vencimiento original
    const diffMs = updated!.fechaVencimiento.getTime() - vencOriginal.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThanOrEqual(27)
    expect(diffDays).toBeLessThanOrEqual(32)
  })

  it('[IDEMPOTENCIA] llamadas duplicadas generan solo 1 PaymentBreakdown', async () => {
    const { sub } = await crearDatos()

    await PaymentService.handleAuthorizedRecurringPayment(String(sub._id), 'ap_idem_001', 10000, 300)
    await PaymentService.handleAuthorizedRecurringPayment(String(sub._id), 'ap_idem_001', 10000, 300)
    await PaymentService.handleAuthorizedRecurringPayment(String(sub._id), 'ap_idem_001', 10000, 300)

    const count = await PaymentBreakdown.countDocuments({ mercadoPagoId: 'ap_idem_001' })
    expect(count).toBe(1)
  })

  it('no procesa sub inexistente sin lanzar error visible al caller', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString()
    await expect(
      PaymentService.handleAuthorizedRecurringPayment(fakeId, 'ap_noop_001', 10000, 300)
    ).resolves.toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────
// handlePreapprovalStatusUpdate
// ─────────────────────────────────────────────────────────────────
describe('handlePreapprovalStatusUpdate', () => {
  it('actualiza mpPreapprovalStatus a "paused"', async () => {
    const { sub } = await crearDatos()

    vi.mocked(mockGetPreapproval).mockResolvedValueOnce({
      id: 'prapp_123',
      status: 'paused',
      external_reference: `pa:${sub._id}`,
    } as unknown as ReturnType<typeof mockGetPreapproval> extends Promise<infer T> ? T : never)

    await PaymentService.handlePreapprovalStatusUpdate('prapp_123')

    const updated = await Subscription.findById(sub._id).lean<{ mpPreapprovalStatus: string; pagoAutomatico: boolean }>()
    expect(updated!.mpPreapprovalStatus).toBe('paused')
    expect(updated!.pagoAutomatico).toBe(true) // no cambia si solo es paused
  })

  it('"cancelled" limpia campos pagoAutomatico', async () => {
    const { sub } = await crearDatos()

    vi.mocked(mockGetPreapproval).mockResolvedValueOnce({
      id: 'prapp_123',
      status: 'cancelled',
      external_reference: `pa:${sub._id}`,
    } as unknown as ReturnType<typeof mockGetPreapproval> extends Promise<infer T> ? T : never)

    await PaymentService.handlePreapprovalStatusUpdate('prapp_123')

    const updated = await Subscription.findById(sub._id)
      .lean<{ pagoAutomatico: boolean; mpPreapprovalId?: string; mpPreapprovalStatus?: string; cardLast4?: string }>()
    expect(updated!.pagoAutomatico).toBe(false)
    expect(updated!.mpPreapprovalId).toBeUndefined()
    expect(updated!.cardLast4).toBeUndefined()
  })

  it('sin coincidencia de mpPreapprovalId — no lanza error', async () => {
    await expect(
      PaymentService.handlePreapprovalStatusUpdate('prapp_desconocido')
    ).resolves.toBeUndefined()
  })
})
