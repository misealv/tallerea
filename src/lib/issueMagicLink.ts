import 'server-only'
import { randomBytes, createHash } from 'crypto'
import dbConnect from '@/lib/db'
import User from '@/models/User'

interface IssueMagicLinkResult {
  magicUrl: string
  expiresAt: Date
}

/**
 * Genera token raw + hash SHA256, lo guarda en User con TTL 15min
 * y retorna la URL de magic link.
 *
 * Uso:
 * - Tras pago confirmado de un alumno invitado (sin password)
 * - En endpoint POST /api/auth/magic/request (alumnos existentes)
 *
 * El caller decide cómo entregar la URL (email, response JSON en dev, etc.).
 */
export async function issueMagicLink(userId: string): Promise<IssueMagicLinkResult> {
  await dbConnect()

  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

  const updated = await User.updateOne(
    { _id: userId, activo: true },
    { magicLinkToken: tokenHash, magicLinkExpiresAt: expiresAt }
  )

  if (updated.matchedCount === 0) {
    throw new Error('Usuario no encontrado o inactivo')
  }

  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'
  // Apunta a /completar-registro para que el alumno cree su contraseña al activar el link
  const magicUrl = `${baseUrl}/completar-registro?token=${rawToken}`

  return { magicUrl, expiresAt }
}
