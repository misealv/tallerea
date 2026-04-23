import 'server-only'
import { z } from 'zod'

/**
 * Validación de variables de entorno al arranque.
 * Si alguna variable requerida falta o tiene formato inválido, el proceso falla en boot.
 * Esto evita errores tardíos en producción con variables mal configuradas.
 *
 * Uso: import { env } from '@/lib/env'
 */

const EnvSchema = z.object({
  // Node
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // MongoDB (requerida en runtime)
  MONGODB_URI: z.string().min(1, 'MONGODB_URI es requerida'),

  // NextAuth (requeridas)
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET debe tener al menos 32 caracteres'),
  NEXTAUTH_URL: z.string().url().default('http://localhost:3000'),

  // MercadoPago (requeridas para pagos reales; opcionales en dev local sin pagos)
  MP_ACCESS_TOKEN: z.string().min(1).optional(),
  MP_WEBHOOK_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_MP_PUBLIC_KEY: z.string().optional(),

  // Resend (requerida para emails)
  RESEND_API_KEY: z.string().min(1).optional(),
  FROM_EMAIL: z.string().default('Tallerea <noreply@tallerea.cl>'),

  // Cloudinary (requeridas para upload de imágenes)
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),

  // Integraciones opcionales
  PEXELS_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
})

export type Env = z.infer<typeof EnvSchema>

function parseEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env)

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(issue => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(
      `[ENV] Validación de variables de entorno falló:\n${issues}\n` +
      `Revisar .env.local (dev) o flyctl/vercel secrets (prod).`
    )
  }

  return parsed.data
}

// Validación diferida: se ejecuta la primera vez que se importa `env`.
// En dev/build puede haber imports a nivel módulo sin process.env completo;
// usamos Proxy para fallar solo si se accede a una variable faltante.
let _env: Env | null = null

export const env = new Proxy({} as Env, {
  get(_target, key: string) {
    if (!_env) _env = parseEnv()
    return _env[key as keyof Env]
  },
})

/**
 * Valida explícitamente al arranque (opcional).
 * Llamar desde `instrumentation.ts` o un boot script para fallar temprano.
 */
export function validateEnv(): void {
  _env = parseEnv()
}

/**
 * Helpers para verificar features opcionales.
 */
export const hasMercadoPago = () =>
  !!env.MP_ACCESS_TOKEN && !!env.MP_WEBHOOK_SECRET

export const hasResend = () => !!env.RESEND_API_KEY

export const hasCloudinary = () =>
  !!env.CLOUDINARY_CLOUD_NAME &&
  !!env.CLOUDINARY_API_KEY &&
  !!env.CLOUDINARY_API_SECRET
