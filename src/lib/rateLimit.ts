import 'server-only'

// Rate limiter in-memory simple (LRU manual).
// Limitación: no funciona en serverless multi-instancia (cada instancia tiene su propio Map).
// Aceptable como mitigación básica anti-spam; para producción usar Upstash Redis.

interface Bucket {
  count: number
  resetAt: number
}

const store = new Map<string, Bucket>()
const MAX_KEYS = 5000

function pruneIfNeeded() {
  if (store.size <= MAX_KEYS) return
  const now = Date.now()
  store.forEach((v, k) => {
    if (v.resetAt < now) store.delete(k)
  })
  // Si sigue grande tras prune de expirados, vacía la mitad más antigua
  if (store.size > MAX_KEYS) {
    const keys = Array.from(store.keys()).slice(0, Math.floor(store.size / 2))
    for (const k of keys) store.delete(k)
  }
}

export interface RateLimitOptions {
  // Identificador único del bucket (ej: `magic:${ip}` o `enroll:${ip}:${email}`)
  key: string
  // Máximo de requests permitidos en la ventana
  limit: number
  // Ventana en milisegundos
  windowMs: number
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetAt: number
}

export function rateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const bucket = store.get(key)

  if (!bucket || bucket.resetAt < now) {
    const fresh = { count: 1, resetAt: now + windowMs }
    store.set(key, fresh)
    pruneIfNeeded()
    return { ok: true, remaining: limit - 1, resetAt: fresh.resetAt }
  }

  bucket.count += 1
  if (bucket.count > limit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt }
  }
  return { ok: true, remaining: limit - bucket.count, resetAt: bucket.resetAt }
}

// Extrae IP del request de Next.js (compat Vercel)
export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}
