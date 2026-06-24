/**
 * Fase 7.5 — Banco de sesiones flexible y rollover.
 * Cubre:
 *  - SiteConfigService.aplicarTopeAcumulacion: tope activo, sin tope, rolloverSoloAutopago
 *  - handleAuthorizedRecurringPayment: descarta sesiones cuando se alcanza el tope
 *  - handlePreapprovalStatusUpdate: ventana de gracia al cancelar con saldo vivo
 *  - reserveByTallerista: bloquea 5ª reserva cuando maxReservasSimultaneas = 4
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'

// Mock completo antes de cualquier import de módulos del proyecto
vi.mock('@/lib/mercadopago', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/mercadopago')>()
  return {
    ...original,
    cancelPreapproval: vi.fn().mockResolvedValue({ id: 'pre_ok', status: 'cancelled' }),
    getPreapproval: vi.fn(),
  }
})

vi.mock('@/lib/resend', () => ({
  sendTopeSesionesAlcanzado: vi.fn().mockResolvedValue(undefined),
  sendBookingPorTallerista:  vi.fn().mockResolvedValue(undefined),
  sendCobroFallido:          vi.fn().mockResolvedValue(undefined),
}))

// Mock SiteConfigService: mocks DB calls, pero preserva aplicarTopeAcumulacion real
vi.mock('@/services/SiteConfigService', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/SiteConfigService')>()
  return {
    SiteConfigService: {
      ...original.SiteConfigService,  // aplicarTopeAcumulacion real (puro, sin DB)
      get: vi.fn(),
      getComisionPct: vi.fn().mockResolvedValue(10),
      calcularMontoConDescuento: vi.fn().mockResolvedValue({ montoFinal: 14000, descuentoCLP: 1000, descuentoPct: 7 }),
      resolverPoliticaRollover: vi.fn().mockResolvedValue({
        rolloverActivo: true,
        rolloverSoloAutopago: true,
        topeAcumulacionFactor: 2,
        mesesGraciaAlCancelar: 2,
        maxReservasSimultaneas: 4,
      }),
    },
  }
})

import { PaymentService } from '@/services/PaymentService'
import { BookingService } from '@/services/BookingService'
import { SiteConfigService } from '@/services/SiteConfigService'
import { getPreapproval as mockGetPreapproval } from '@/lib/mercadopago'
import { sendTopeSesionesAlcanzado } from '@/lib/resend'
import User from '@/models/User'
import Workshop from '@/models/Workshop'
import Subscription from '@/models/Subscription'
import Booking from '@/models/Booking'
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
  vi.clearAllMocks()
  await mongoose.connection.dropDatabase()
})

// Helper — crea usuarios, taller y sub base
async function crearBase(opts: { sesionesDisponibles?: number; pagoAutomatico?: boolean } = {}) {
  const owner   = await User.create({ email: 'owner@t.cl', name: 'Owner' })
  const student = await User.create({ email: 'alumno@t.cl', name: 'Alumno' })
  const workshop = await Workshop.create({
    ownerId: owner._id, titulo: 'Cerámica', descripcion: 'D', slug: `c-${Date.now()}`,
    estado: 'publicado', tipo: 'ceramica', modalidad: 'presencial',
    modeloAcceso: 'puntual', modalidadPrecio: 'gratuito', precio: 0,
    fechaInicio: new Date(),
    plan: { sesionesIncluidas: 4, vigencia: 'mensual' },
    slots: [],
  })
  const sub = await Subscription.create({
    workshopId: workshop._id, studentId: student._id, monto: 15000, precioSnapshot: 15000,
    estado: 'activa', activo: true,
    sesionesTotales: opts.sesionesDisponibles ?? 4,
    sesionesDisponibles: opts.sesionesDisponibles ?? 4,
    sesionesUsadas: 0,
    fechaVencimiento: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    pagoAutomatico: opts.pagoAutomatico ?? true,
    mpPreapprovalId: opts.pagoAutomatico ?? true ? 'pre_123' : undefined,
    mpPreapprovalStatus: opts.pagoAutomatico ?? true ? 'authorized' : undefined,
    intentosCobroFallidos: 0,
  })
  return { owner, student, workshop, sub }
}

// ═══════════════════════════════════════════════════════════════
// 1. aplicarTopeAcumulacion — función pura, sin DB
// ═══════════════════════════════════════════════════════════════
describe('SiteConfigService.aplicarTopeAcumulacion', () => {
  const politica = { rolloverActivo: true, rolloverSoloAutopago: true, topeAcumulacionFactor: 2 }

  it('aplica tope cuando saldo + nuevas > factor × ciclo', () => {
    // saldo=6, añadir 4 → 10; tope = 4*2 = 8 → descarta 2
    const r = SiteConfigService.aplicarTopeAcumulacion(6, 4, 4, politica, true)
    expect(r.nuevoSaldo).toBe(8)
    expect(r.sesionesDescartadas).toBe(2)
  })

  it('no aplica tope cuando rolloverActivo = false', () => {
    const r = SiteConfigService.aplicarTopeAcumulacion(6, 4, 4, { ...politica, rolloverActivo: false }, true)
    expect(r.nuevoSaldo).toBe(10)
    expect(r.sesionesDescartadas).toBe(0)
  })

  it('rolloverSoloAutopago=true → no aplica a sub manual (pagoAutomatico=false)', () => {
    const r = SiteConfigService.aplicarTopeAcumulacion(6, 4, 4, politica, false)
    expect(r.nuevoSaldo).toBe(10)
    expect(r.sesionesDescartadas).toBe(0)
  })

  it('no descarta si no se supera el tope', () => {
    // saldo=2, añadir 4 → 6; tope = 8 → sin descarte
    const r = SiteConfigService.aplicarTopeAcumulacion(2, 4, 4, politica, true)
    expect(r.nuevoSaldo).toBe(6)
    expect(r.sesionesDescartadas).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. handleAuthorizedRecurringPayment — tope de acumulación
// ═══════════════════════════════════════════════════════════════
describe('handleAuthorizedRecurringPayment — tope', () => {
  it('descarta sesiones cuando el saldo supera el tope y notifica al alumno', async () => {
    const { sub } = await crearBase({ sesionesDisponibles: 6 })

    await PaymentService.handleAuthorizedRecurringPayment(
      String(sub._id), 'ap_tope_001', 15000, 0,
    )

    const updated = await Subscription.findById(sub._id)
    // saldo 6 + 4 = 10 → tope 4×2=8 → nuevoSaldo=8, descartadas=2
    expect(updated?.sesionesDisponibles).toBe(8)
    expect(sendTopeSesionesAlcanzado).toHaveBeenCalledOnce()
  })

  it('no descarta cuando el saldo está por debajo del tope', async () => {
    const { sub } = await crearBase({ sesionesDisponibles: 1 })

    await PaymentService.handleAuthorizedRecurringPayment(
      String(sub._id), 'ap_sin_tope_001', 15000, 0,
    )

    const updated = await Subscription.findById(sub._id)
    // saldo 1 + 4 = 5 ≤ tope 8 → nuevoSaldo=5
    expect(updated?.sesionesDisponibles).toBe(5)
    expect(sendTopeSesionesAlcanzado).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. handlePreapprovalStatusUpdate — ventana de gracia
// ═══════════════════════════════════════════════════════════════
describe('handlePreapprovalStatusUpdate — ventana de gracia al cancelar', () => {
  it('con saldo vivo extiende fechaVencimiento y activa saldoEnGracia', async () => {
    const { sub } = await crearBase({ sesionesDisponibles: 3 })
    const vencimientoInicial = new Date(sub.fechaVencimiento)

    // Simular que MP cancela el mandato
    vi.mocked(mockGetPreapproval).mockResolvedValueOnce({
      id: 'pre_123',
      status: 'cancelled',
      external_reference: `pa:${sub._id}`,
    } as Awaited<ReturnType<typeof mockGetPreapproval>>)

    await PaymentService.handlePreapprovalStatusUpdate('pre_123')

    const updated = await Subscription.findById(sub._id)
    expect(updated?.saldoEnGracia).toBe(true)
    // Tras cancelar con saldo vivo, el mandato se limpia para permitir re-activación
    expect(updated?.pagoAutomatico).toBe(false)
    expect(updated?.mpPreapprovalId).toBeUndefined()
    expect(updated?.mpPreapprovalStatus).toBeUndefined()
    // fechaVencimiento se extendió (mesesGraciaAlCancelar = 2 → al menos 1 mes más)
    expect(new Date(updated!.fechaVencimiento).getTime()).toBeGreaterThan(vencimientoInicial.getTime())
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. reserveByTallerista — maxReservasSimultaneas
// ═══════════════════════════════════════════════════════════════
describe('reserveByTallerista — maxReservasSimultaneas', () => {
  it('bloquea la 5ª reserva cuando el límite es 4', async () => {
    const futuro = new Date('2099-01-01')
    const { owner, student, workshop, sub } = await crearBase({ sesionesDisponibles: 10 })

    // Añadir 6 slots al taller
    await Workshop.updateOne(
      { _id: workshop._id },
      {
        $push: {
          slots: {
            $each: Array.from({ length: 6 }, (_, i) => ({
              fecha: new Date(futuro.getTime() + i * 86400000),
              horaInicio: '10:00', horaFin: '11:00',
              cupo: 10, reservas: 0, cancelado: false,
            })),
          },
        },
      },
    )

    // Crear 4 bookings "reservada" futuros para la misma sub
    for (let i = 0; i < 4; i++) {
      await Booking.create({
        subscriptionId: sub._id, workshopId: workshop._id, studentId: student._id,
        slotIndex: i, fecha: new Date(futuro.getTime() + i * 86400000),
        estado: 'reservada', activo: true,
      })
    }

    // El 5º intento debe fallar por límite
    await expect(
      BookingService.reserveByTallerista(String(owner._id), String(sub._id), 4),
    ).rejects.toThrow(/Límite de reservas simultáneas alcanzado/)
  })
})
