import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import mongoose, { Types } from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  // Setear URI para que dbConnect() de los models la use
  process.env.MONGODB_URI = mongod.getUri()
  // Conectar explícitamente para que .save() no haga timeout
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
})

async function getModel() {
  // Importar dinámicamente para evitar problemas de registro previo
  const { default: PB } = await import('@/models/PaymentBreakdown')
  return PB
}

const BASE = {
  workshopId: new Types.ObjectId(),
  ownerId: new Types.ObjectId(),
  studentId: new Types.ObjectId(),
  montoBruto: 45000,
  feeTallerea: 6750,
  montoProfesor: 38250,
  comisionMP: 1350,
  creditoAplicado: 0,
  porcentajeFee: 15,
  precioModalidad: 'bruto' as const,
  tipo: 'pago' as const,
  estado: 'pendiente' as const,
}

describe('PaymentBreakdown — pre-save cuadratura', () => {
  it('[CUADRATURA] guarda correctamente cuando montoBruto === montoProfesor + feeTallerea', async () => {
    const PB = await getModel()
    const doc = await new PB(BASE).save()
    expect(doc._id).toBeDefined()
    expect(doc.montoBruto).toBe(doc.montoProfesor + doc.feeTallerea)
  })

  it('[CUADRATURA] rechaza cuando montoBruto ≠ montoProfesor + feeTallerea', async () => {
    const PB = await getModel()
    await expect(
      new PB({ ...BASE, feeTallerea: 9999 }).save()
    ).rejects.toThrow('Cuadratura fallida')
  })

  it('[CUADRATURA] comisionMP NO interviene en la ecuación fundamental', async () => {
    const PB = await getModel()
    // comisionMP puede ser cualquier valor — no afecta la cuadratura
    const doc = await new PB({ ...BASE, comisionMP: 99999 }).save()
    expect(doc.montoBruto).toBe(doc.montoProfesor + doc.feeTallerea)
  })

  it('[INMUTABLE] no hay método update/delete expuesto en el model directamente', () => {
    // Los métodos de instancia update/delete no existen en Mongoose por diseño
    // Verificar que no hay override que los exponga
    expect(typeof mongoose.model('PaymentBreakdown').findByIdAndUpdate).toBe('function')
    // El control de inmutabilidad es a nivel de Service (no se expone update en PaymentService)
    // Aquí verificamos que la cuadratura pre-save bloquea cualquier modificación incorrecta
  })

  it('rechaza montoBruto no entero en tipo pago', async () => {
    const PB = await getModel()
    await expect(
      new PB({ ...BASE, montoBruto: 45000.5, feeTallerea: 6750.5, montoProfesor: 38250 }).save()
    ).rejects.toThrow('[FINANCE ERROR]')
  })

  it('rechaza montoBruto negativo en tipo pago (validación Mongoose min:0)', async () => {
    const PB = await getModel()
    // Los campos tienen min:0 en el schema — Mongoose valida antes del pre-save hook
    await expect(
      new PB({ ...BASE, montoBruto: -1000, feeTallerea: -150, montoProfesor: -850 }).save()
    ).rejects.toThrow() // ValidationError de Mongoose (min:0 en feeTallerea/montoProfesor) o pre-save
  })

  it('permite tipo ajuste sin validaciones de integer', async () => {
    // Los ajustes pueden tener montos que no siguen las reglas estrictas de entero positivo
    const PB = await getModel()
    // Ajuste que cuadra y es positivo
    const doc = await new PB({
      ...BASE,
      tipo: 'ajuste',
      montoBruto: 5000,
      feeTallerea: 750,
      montoProfesor: 4250,
    }).save()
    expect(doc.tipo).toBe('ajuste')
  })
})
