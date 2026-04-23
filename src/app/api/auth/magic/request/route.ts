import { NextRequest, NextResponse } from 'next/server'
import { randomBytes, createHash } from 'crypto'
import dbConnect from '@/lib/db'
import User from '@/models/User'
import { sendMagicLink } from '@/lib/resend'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  await dbConnect()

  // Solo usuarios existentes reciben magic link — los alumnos nacen de transacción (no por auto-registro)
  const user = await User.findOne({ email })

  const isDev = process.env.NODE_ENV === 'development'

  // Respuesta uniforme (anti-enumeración): siempre 200 ok, independiente de si el user existe
  if (!user || !user.activo) {
    return NextResponse.json({ ok: true })
  }

  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 min

  await User.updateOne({ _id: user._id }, {
    magicLinkToken: tokenHash,
    magicLinkExpiresAt: expiresAt,
  })

  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'
  const magicUrl = `${baseUrl}/magic?token=${rawToken}`

  await sendMagicLink({ email, magicUrl })

  return NextResponse.json({
    ok: true,
    ...(isDev ? { magicUrl } : {}),
  })
}
