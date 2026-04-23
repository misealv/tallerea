import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import mongoose, { Types } from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  // Inyectar URI para que dbConnect() de los services no falle
  process.env.MONGODB_URI = mongod.getUri()
  // Conectar explícitamente para que .save() en helpers no haga timeout
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
  for (const key in collections) {
    await collections[key].deleteMany({})
  }
  vi.restoreAllMocks()
})

// Helper: crea PaymentBreakdowns de prueba
async function createBreakdowns(count: number, extra: Record<string, unknown> = {}) {
  const { default: PB } = await import('@/models/PaymentBreakdown')
  const ownerId = new Types.ObjectId()
  const docs = []
  for (let i = 0; i < count; i++) {
    const doc = await new PB({
      workshopId: new Types.ObjectId(),
      ownerId,
      studentId: new Types.ObjectId(),
      montoBruto: 45000,
      feeTallerea: 6750,
      montoProfesor: 38250,
      comisionMP: 1350,
      creditoAplicado: 0,
      porcentajeFee: 15,
      precioModalidad: 'bruto',
      tipo: 'pago',
      estado: 'cobrado',
      fechaCobro: new Date(),
      ...extra,
    }).save()
    docs.push(doc)
  }
  return { ownerId, docs }
}

describe('LiquidationService.generate', () => {
  it('genera liquidación correctamente desde breakdowns cobrados', async () => {
    const { LiquidationService } = await import('@/services/LiquidationService')
    const { default: User } = await import('@/models/User')
    const { docs, ownerId } = await createBreakdowns(3)

    // Crear usuario con mínimo de liquidación bajo
    await new User({
      _id: ownerId,
      name: 'Test Owner',
      email: `owner-${ownerId}@test.cl`,
      role: 'user',
      activo: true,
      taller: { estado: 'aprobado', slug: `casona-${ownerId}`, liquidacionMinima: 1000 },
    }).save()

    // Mock del FinanceService.log para evitar error en audit
    const { FinanceService } = await import('@/services/FinanceService')
    vi.spyOn(FinanceService, 'log').mockResolvedValue(undefined)

    const desde = new Date('2020-01-01')
    const hasta = new Date('2030-12-31')
    const liq = await LiquidationService.generate(
      ownerId.toString(),
      desde,
      hasta,
      new Types.ObjectId().toString()
    )

    expect(liq.totalBruto).toBe(45000 * 3)
    expect(liq.totalFeeTallerea).toBe(6750 * 3)
    expect(liq.totalProfesor).toBe(38250 * 3)
    // [CUADRATURA]
    expect(liq.totalBruto).toBe(liq.totalProfesor + liq.totalFeeTallerea)
    expect(liq.cantidadPagos).toBe(3)
    expect(liq.estado).toBe('pendiente')
  })

  it('[CUADRATURA] bloquea si breakdowns tienen descuadre interno', async () => {
    const { LiquidationService } = await import('@/services/LiquidationService')
    const { default: User } = await import('@/models/User')
    const { default: PB } = await import('@/models/PaymentBreakdown')

    const ownerId = new Types.ObjectId()
    await new User({
      _id: ownerId,
      name: 'Test',
      email: `owner2-${ownerId}@test.cl`,
      role: 'user',
      activo: true,
      taller: { estado: 'aprobado', slug: `cuad-${ownerId}`, liquidacionMinima: 0 },
    }).save()

    // Crear breakdown forzando descuadre via updateOne (bypass pre-save)
    const doc = await new PB({
      workshopId: new Types.ObjectId(),
      ownerId,
      studentId: new Types.ObjectId(),
      montoBruto: 45000,
      feeTallerea: 6750,
      montoProfesor: 38250,
      comisionMP: 0,
      creditoAplicado: 0,
      porcentajeFee: 15,
      precioModalidad: 'bruto',
      tipo: 'pago',
      estado: 'cobrado',
      fechaCobro: new Date(),
    }).save()

    // Forzar descuadre sin pasar por pre-save
    await PB.collection.updateOne(
      { _id: doc._id },
      { $set: { montoProfesor: 99999 } }
    )

    await expect(
      LiquidationService.generate(
        ownerId.toString(),
        new Date('2020-01-01'),
        new Date('2030-12-31'),
        new Types.ObjectId().toString()
      )
    ).rejects.toThrow('[FINANCE ALERT]')
  })

  it('lanza error si total es menor al mínimo de liquidación', async () => {
    const { LiquidationService } = await import('@/services/LiquidationService')
    const { default: User } = await import('@/models/User')
    const { ownerId } = await createBreakdowns(1)

    await new User({
      _id: ownerId,
      name: 'Test Min',
      email: `owner3-${ownerId}@test.cl`,
      role: 'user',
      activo: true,
      taller: { estado: 'aprobado', slug: `min-${ownerId}`, liquidacionMinima: 999999 }, // mínimo muy alto
    }).save()

    const { FinanceService } = await import('@/services/FinanceService')
    vi.spyOn(FinanceService, 'log').mockResolvedValue(undefined)

    await expect(
      LiquidationService.generate(
        ownerId.toString(),
        new Date('2020-01-01'),
        new Date('2030-12-31'),
        new Types.ObjectId().toString()
      )
    ).rejects.toThrow('inferior al mínimo')
  })

  it('lanza error si no hay breakdowns cobrados en el período', async () => {
    const { LiquidationService } = await import('@/services/LiquidationService')
    const ownerId = new Types.ObjectId()

    await expect(
      LiquidationService.generate(
        ownerId.toString(),
        new Date('2020-01-01'),
        new Date('2020-01-02'),
        new Types.ObjectId().toString()
      )
    ).rejects.toThrow('No hay pagos cobrados')
  })
})

describe('LiquidationService.markAsPaid — doble verificación', () => {
  it('marca como pagada cuando la suma cuadra', async () => {
    const { default: User } = await import('@/models/User')
    const { default: Liquidation } = await import('@/models/Liquidation')
    const { LiquidationService } = await import('@/services/LiquidationService')
    const { FinanceService } = await import('@/services/FinanceService')
    vi.spyOn(FinanceService, 'log').mockResolvedValue(undefined)

    const { docs, ownerId } = await createBreakdowns(2)
    await new User({
      _id: ownerId,
      name: 'Pay Test',
      email: `pay-${ownerId}@test.cl`,
      role: 'user',
      activo: true,
      taller: { estado: 'aprobado', slug: `pay-${ownerId}`, liquidacionMinima: 0 },
    }).save()

    const liq = await LiquidationService.generate(
      ownerId.toString(),
      new Date('2020-01-01'),
      new Date('2030-12-31'),
      new Types.ObjectId().toString()
    )

    const result = await LiquidationService.markAsPaid(
      liq._id.toString(),
      new Types.ObjectId().toString()
    )
    expect(result.estado).toBe('pagada')
    expect(result.fechaPago).toBeDefined()
  })

  it('[LIQUIDACION] bloquea si suma real difiere del declarado', async () => {
    const { default: User } = await import('@/models/User')
    const { default: Liquidation } = await import('@/models/Liquidation')
    const { default: PB } = await import('@/models/PaymentBreakdown')
    const { LiquidationService } = await import('@/services/LiquidationService')
    const { FinanceService } = await import('@/services/FinanceService')
    vi.spyOn(FinanceService, 'log').mockResolvedValue(undefined)

    const { docs, ownerId } = await createBreakdowns(1)
    await new User({
      _id: ownerId,
      name: 'Desc Test',
      email: `desc-${ownerId}@test.cl`,
      role: 'user',
      activo: true,
      taller: { estado: 'aprobado', slug: `desc-${ownerId}`, liquidacionMinima: 0 },
    }).save()

    const liq = await LiquidationService.generate(
      ownerId.toString(),
      new Date('2020-01-01'),
      new Date('2030-12-31'),
      new Types.ObjectId().toString()
    )

    // Forzar descuadre en un breakdown después de liquidar
    await PB.collection.updateOne(
      { _id: docs[0]._id },
      { $set: { montoProfesor: 1 } }
    )

    await expect(
      LiquidationService.markAsPaid(
        liq._id.toString(),
        new Types.ObjectId().toString()
      )
    ).rejects.toThrow('[FINANCE ALERT]')
  })

  it('lanza error si ya fue pagada (idempotencia)', async () => {
    const { default: User } = await import('@/models/User')
    const { LiquidationService } = await import('@/services/LiquidationService')
    const { FinanceService } = await import('@/services/FinanceService')
    vi.spyOn(FinanceService, 'log').mockResolvedValue(undefined)

    const { ownerId } = await createBreakdowns(1)
    await new User({
      _id: ownerId,
      name: 'Idem Test',
      email: `idem-${ownerId}@test.cl`,
      role: 'user',
      activo: true,
      taller: { estado: 'aprobado', slug: `idem-${ownerId}`, liquidacionMinima: 0 },
    }).save()

    const liq = await LiquidationService.generate(
      ownerId.toString(),
      new Date('2020-01-01'),
      new Date('2030-12-31'),
      new Types.ObjectId().toString()
    )

    const userId = new Types.ObjectId().toString()
    await LiquidationService.markAsPaid(liq._id.toString(), userId)

    await expect(
      LiquidationService.markAsPaid(liq._id.toString(), userId)
    ).rejects.toThrow('ya fue pagada')
  })
})
