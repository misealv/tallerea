/**
 * FASE 7 — Tests de QA bloqueante
 *
 * Caso integral: Belén Opazo (apoderado) inscribe a Juan Pablo y Fernando
 * con precio especial 2024. Verifica las tres invariantes críticas:
 *
 * [1] Inscripción manual + dependiente + precio especial → NUNCA crea PaymentBreakdown
 * [2] LiquidationService.generate ignora origenInscripcion='manual' (no breakdowns = 0)
 * [3] Panel agrupado: Booking.find({ studentId: belénId }) devuelve bookings de sus dependientes
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import mongoose, { Types } from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongod.getUri()
  const { default: dbConnect } = await import('@/lib/db')
  await dbConnect()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
  delete process.env.MONGODB_URI
})

afterEach(async () => {
  const collections = mongoose.connection.collections
  for (const key in collections) await collections[key].deleteMany({})
  vi.restoreAllMocks()
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function crearOwner(suffix: string) {
  const { default: User } = await import('@/models/User')
  const ownerId = new Types.ObjectId()
  await new User({
    _id: ownerId,
    name: `Tallerista ${suffix}`,
    email: `owner-${suffix}-${ownerId}@test.cl`,
    role: 'user',
    activo: true,
    taller: { estado: 'aprobado', slug: `taller-${suffix}-${ownerId}`, liquidacionMinima: 0 },
    dependents: [],
    creditoDisponible: 0,
  }).save()
  return ownerId
}

async function crearWorkshopRecurrente(ownerId: Types.ObjectId) {
  const { default: Workshop } = await import('@/models/Workshop')
  return new Workshop({
    titulo:           'Cerámica martes',
    slug:             `ceramica-martes-${ownerId}`,
    ownerId,
    tipo:             'otro',
    modalidad:        'presencial',
    descripcion:      'Taller de cerámica para pruebas',
    precio:           50000,
    fechaInicio:      new Date('2026-05-01'),
    modeloAcceso:     'recurrente',
    modalidadPrecio:  'paquetes',
    estado:           'publicado',
    activo:           true,
    paquetes:         [{
      nombre: 'Mensual 4 sesiones', sesionesIncluidas: 4, precio: 50000,
      duracionDias: 30, activo: true,
    }],
    slots: [
      { dia: 'martes', horaInicio: '18:00', horaFin: '20:00', fecha: new Date('2026-05-06'), cupoMax: 10, cupoDisponible: 10, activo: true },
      { dia: 'martes', horaInicio: '18:00', horaFin: '20:00', fecha: new Date('2026-05-13'), cupoMax: 10, cupoDisponible: 10, activo: true },
    ],
  }).save()
}

/**
 * Inscripción manual vía SubscriptionService (ruta real de producción).
 * El magic link try/catch en el service garantiza que no rompe aunque falte NEXTAUTH_URL.
 */
async function inscribirManual(
  ownerId: Types.ObjectId,
  workshopId: Types.ObjectId,
  studentEmail: string,
  studentNombre: string,
  dependentNombre: string,
  precioSnapshot: number
) {
  const { SubscriptionService } = await import('@/services/SubscriptionService')
  return SubscriptionService.createManual({
    ownerId: String(ownerId),
    workshopId: String(workshopId),
    studentEmail,
    studentNombre,
    dependentNombre,
    precioEspecial: true,
    precioSnapshot,
    notaPrecioEspecial: 'Alumna desde 2024 — tarifa congelada',
  })
}

// ─── Suite 1: Caso integral Belén ────────────────────────────────────────────

describe('[FASE 7] Caso integral — Belén + Juan Pablo + Fernando', () => {

  it('crea dos subscripciones manuales con dependentId y precioEspecial correcto', async () => {
    const ownerId = await crearOwner('belen1')
    const workshop = await crearWorkshopRecurrente(ownerId)

    const subJP  = await inscribirManual(ownerId, workshop._id as Types.ObjectId, 'belen@test.cl', 'Belén Opazo', 'Juan Pablo', 45000)
    const subFer = await inscribirManual(ownerId, workshop._id as Types.ObjectId, 'belen@test.cl', 'Belén Opazo', 'Fernando',   45000)

    // Juan Pablo
    expect(subJP.dependentNombreSnapshot).toBe('Juan Pablo')
    expect(subJP.precioEspecial).toBe(true)
    expect(subJP.precioSnapshot).toBe(45000)
    expect(subJP.origenInscripcion).toBe('manual')
    expect(subJP.estado).toBe('activa')

    // Fernando — mismo titular, distinto dependiente
    expect(String(subFer.studentId)).toBe(String(subJP.studentId))
    expect(subFer.dependentNombreSnapshot).toBe('Fernando')
    expect(subFer.precioSnapshot).toBe(45000)
    expect(subFer.origenInscripcion).toBe('manual')
  })

  it('[FINANCE RISK] inscripción manual NUNCA crea PaymentBreakdown', async () => {
    const { default: PaymentBreakdown } = await import('@/models/PaymentBreakdown')
    const ownerId = await crearOwner('belen2')
    const workshop = await crearWorkshopRecurrente(ownerId)

    await inscribirManual(ownerId, workshop._id as Types.ObjectId, 'belen2@test.cl', 'Belén Opazo', 'Juan Pablo', 45000)
    await inscribirManual(ownerId, workshop._id as Types.ObjectId, 'belen2@test.cl', 'Belén Opazo', 'Fernando',   45000)

    const count = await PaymentBreakdown.countDocuments({})
    expect(count).toBe(0)
  })

  it('permite precio especial $0 (alumno becado)', async () => {
    const ownerId = await crearOwner('belen3')
    const workshop = await crearWorkshopRecurrente(ownerId)

    const sub = await inscribirManual(ownerId, workshop._id as Types.ObjectId, 'belen3@test.cl', 'Belén Opazo', 'Juan Pablo', 0)
    expect(sub.precioSnapshot).toBe(0)
    expect(sub.precioEspecial).toBe(true)
    expect(sub.estado).toBe('activa')
  })
})

// ─── Suite 2: Liquidaciones ignoran manual ───────────────────────────────────

describe('[FASE 7] Liquidaciones no incluyen inscripciones manuales', () => {

  it('LiquidationService.generate lanza error si solo existen subscripciones manuales', async () => {
    const { LiquidationService } = await import('@/services/LiquidationService')
    const ownerId = await crearOwner('liq1')
    const workshop = await crearWorkshopRecurrente(ownerId)

    // Inscribir manualmente — no debe crear PaymentBreakdown
    await inscribirManual(ownerId, workshop._id as Types.ObjectId, 'belen-liq@test.cl', 'Belén Opazo', 'Juan Pablo', 45000)
    await inscribirManual(ownerId, workshop._id as Types.ObjectId, 'belen-liq@test.cl', 'Belén Opazo', 'Fernando',   45000)

    const { FinanceService } = await import('@/services/FinanceService')
    vi.spyOn(FinanceService, 'log').mockResolvedValue(undefined)

    // LiquidationService solo consulta PaymentBreakdown → 0 encontrados → error
    await expect(
      LiquidationService.generate(
        ownerId.toString(),
        new Date('2020-01-01'),
        new Date('2030-12-31'),
        new Types.ObjectId().toString()
      )
    ).rejects.toThrow(/no hay pagos|sin pagos|no.*pago/i)
  })

  it('PaymentBreakdown de checkout SI entra en liquidación; manual coexiste sin contaminar', async () => {
    const { default: PB } = await import('@/models/PaymentBreakdown')
    const { LiquidationService } = await import('@/services/LiquidationService')
    const ownerId = await crearOwner('liq2')
    const workshop = await crearWorkshopRecurrente(ownerId)
    const wId = workshop._id as Types.ObjectId

    // Inscripción manual — no debe entrar en liquidación
    await inscribirManual(ownerId, wId, 'belen-liq2@test.cl', 'Belén Opazo', 'Juan Pablo', 45000)

    // Pago real por checkout — sí debe entrar
    await new PB({
      workshopId: wId,
      ownerId,
      studentId: new Types.ObjectId(),
      montoBruto: 50000,
      feeTallerea: 7500,
      montoProfesor: 42500,
      comisionMP: 1500,
      creditoAplicado: 0,
      porcentajeFee: 15,
      precioModalidad: 'bruto',
      tipo: 'pago',
      estado: 'cobrado',
      fechaCobro: new Date(),
    }).save()

    const { FinanceService } = await import('@/services/FinanceService')
    vi.spyOn(FinanceService, 'log').mockResolvedValue(undefined)

    const liq = await LiquidationService.generate(
      ownerId.toString(),
      new Date('2020-01-01'),
      new Date('2030-12-31'),
      new Types.ObjectId().toString()
    )

    // Liquidación solo incluye el pago checkout, no el manual
    expect(liq.cantidadPagos).toBe(1)
    expect(liq.totalBruto).toBe(50000)
    expect(liq.totalProfesor).toBe(42500)
  })
})

// ─── Suite 3: Panel agrupado del apoderado ───────────────────────────────────

describe('[FASE 7] Panel agrupado — apoderado ve bookings de sus dependientes', () => {

  it('Booking.find({ studentId: belénId }) retorna bookings propios Y de dependientes', async () => {
    const { default: Booking } = await import('@/models/Booking')
    const { default: User } = await import('@/models/User')

    // Crear Belén con dos dependientes
    const belen = await new User({
      name: 'Belén Opazo',
      email: 'belen-panel@test.cl',
      role: 'user',
      activo: true,
      dependents: [
        { nombre: 'Juan Pablo', activo: true },
        { nombre: 'Fernando',   activo: true },
      ],
      creditoDisponible: 0,
    }).save()

    const belenId = belen._id
    const juanPabloId = belen.dependents[0]._id
    const fernandoId  = belen.dependents[1]._id

    const workshopId = new Types.ObjectId()
    const subId = new Types.ObjectId()

    // Booking propio de Belén (sin dependiente)
    await new Booking({
      workshopId, studentId: belenId, subscriptionId: subId,
      slotIndex: 0, fecha: new Date('2026-05-20T21:00:00Z'), estado: 'reservada', activo: true,
    }).save()

    // Booking de Juan Pablo (dependiente de Belén) — studentId sigue siendo Belén
    await new Booking({
      workshopId, studentId: belenId, subscriptionId: subId,
      dependentId: juanPabloId, dependentNombreSnapshot: 'Juan Pablo',
      slotIndex: 1, fecha: new Date('2026-05-20T21:00:00Z'), estado: 'reservada', activo: true,
    }).save()

    // Booking de Fernando (dependiente de Belén)
    await new Booking({
      workshopId, studentId: belenId, subscriptionId: subId,
      dependentId: fernandoId, dependentNombreSnapshot: 'Fernando',
      slotIndex: 2, fecha: new Date('2026-05-20T21:00:00Z'), estado: 'reservada', activo: true,
    }).save()

    // La misma query que usa el panel del alumno en producción
    const bookings = await Booking.find({ studentId: belenId, activo: true }).lean()
    expect(bookings).toHaveLength(3)

    const nombres = bookings.map((b: unknown) => (b as { dependentNombreSnapshot?: string }).dependentNombreSnapshot ?? 'Belén')
    expect(nombres).toContain('Juan Pablo')
    expect(nombres).toContain('Fernando')
    expect(nombres).toContain('Belén')
  })

  it('dependentNombreSnapshot queda congelado aunque se elimine el dependiente', async () => {
    const { default: Booking } = await import('@/models/Booking')
    const { default: User } = await import('@/models/User')

    const belen = await new User({
      name: 'Belén Opazo',
      email: 'belen-frozen@test.cl',
      role: 'user',
      activo: true,
      dependents: [{ nombre: 'Juan Pablo', activo: true }],
      creditoDisponible: 0,
    }).save()

    const belenId = belen._id
    const juanPabloId = belen.dependents[0]._id

    await new Booking({
      workshopId: new Types.ObjectId(), studentId: belenId,
      subscriptionId: new Types.ObjectId(),
      dependentId: juanPabloId, dependentNombreSnapshot: 'Juan Pablo',
      slotIndex: 0, fecha: new Date(), estado: 'reservada', activo: true,
    }).save()

    // Eliminar (desactivar) al dependiente
    await User.updateOne(
      { _id: belenId, 'dependents._id': juanPabloId },
      { $set: { 'dependents.$.activo': false } }
    )

    // El snapshot en Booking debe persistir
    const booking = await Booking.findOne({ studentId: belenId }).lean<{ dependentNombreSnapshot?: string }>()
    expect(booking?.dependentNombreSnapshot).toBe('Juan Pablo')
  })
})
