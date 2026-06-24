/**
 * H7 — [SECURITY] Anti-replay del webhook de MercadoPago.
 * Verifica que la route rechace:
 *  - ts fuera de la ventana ±5 min → 401
 *  - firma HMAC inválida → 401
 * Y procese normalmente con ts reciente y firma válida.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import crypto from 'crypto'
import { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

// ─── mocks ───────────────────────────────────────────────────────
vi.mock('@/lib/mercadopago', () => ({
  paymentClient: { get: vi.fn() },
  getAuthorizedPayment: vi.fn(),
}))

vi.mock('@/services/PaymentService', () => ({
  PaymentService: {
    handlePreapprovalStatusUpdate:     vi.fn().mockResolvedValue(undefined),
    handleAuthorizedRecurringPayment:  vi.fn().mockResolvedValue(undefined),
    handleRejectedRecurringPayment:    vi.fn().mockResolvedValue(undefined),
    handleApprovedPayment:             vi.fn().mockResolvedValue(undefined),
    handleApprovedSubscription:        vi.fn().mockResolvedValue(undefined),
    handleApprovedRecarga:             vi.fn().mockResolvedValue(undefined),
    handleApprovedPrepaidRenewal:      vi.fn().mockResolvedValue(undefined),
  },
}))

// ─── helpers ─────────────────────────────────────────────────────
const SECRET = 'test-webhook-secret'
const DATA_ID = '123'
const REQUEST_ID = 'req-abc'

function buildRequest(tsOverride?: number, bodyObj = { type: 'subscription_preapproval', data: { id: 'pre_xyz' } }, brokenHash = false) {
  const ts = tsOverride ?? Math.floor(Date.now() / 1000)
  const manifest = `id:${DATA_ID};request-id:${REQUEST_ID};ts:${ts};`
  const hash = crypto.createHmac('sha256', SECRET).update(manifest).digest('hex')
  const signature = `ts=${ts},v1=${brokenHash ? hash + 'bad' : hash}`

  return new NextRequest(
    `http://localhost/api/payments/webhook?data.id=${DATA_ID}`,
    {
      method: 'POST',
      headers: {
        'x-signature':  signature,
        'x-request-id': REQUEST_ID,
        'content-type': 'application/json',
      },
      body: JSON.stringify(bodyObj),
    }
  )
}

// ─── setup ───────────────────────────────────────────────────────
let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongod.getUri()
  process.env.MP_WEBHOOK_SECRET = SECRET
  process.env.NEXTAUTH_URL = 'http://localhost:3000'
  const { default: dbConnect } = await import('@/lib/db')
  await dbConnect()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
  delete process.env.MP_WEBHOOK_SECRET
  delete process.env.MONGODB_URI
})

// ─── tests ───────────────────────────────────────────────────────
describe('webhook route — anti-replay (H7)', () => {

  it('[SECURITY] ts viejo (>5 min) → 401', async () => {
    const oldTs = Math.floor(Date.now() / 1000) - 6 * 60   // 6 min atrás
    const { POST } = await import('@/app/api/payments/webhook/route')
    const res = await POST(buildRequest(oldTs))
    expect(res.status).toBe(401)
  })

  it('[SECURITY] ts futuro (>5 min adelante) → 401', async () => {
    const futureTs = Math.floor(Date.now() / 1000) + 6 * 60   // 6 min adelante
    const { POST } = await import('@/app/api/payments/webhook/route')
    const res = await POST(buildRequest(futureTs))
    expect(res.status).toBe(401)
  })

  it('[SECURITY] firma HMAC inválida → 401', async () => {
    const { POST } = await import('@/app/api/payments/webhook/route')
    const res = await POST(buildRequest(undefined, { type: 'subscription_preapproval', data: { id: 'pre_xyz' } }, true))
    expect(res.status).toBe(401)
  })

  it('ts reciente + firma válida → 200', async () => {
    const { POST } = await import('@/app/api/payments/webhook/route')
    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
  })

})
