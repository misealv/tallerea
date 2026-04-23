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

  // Buscar usuario existente o crear alumno nuevo (role: 'user', sin password)
  let user = await User.findOne({ email })
  if (!user) {
    user = await new User({ name: email.split('@')[0], email, role: 'user' }).save()
  }
  if (!user.activo) {
    return NextResponse.json({ error: 'Cuenta suspendida' }, { status: 403 })
  }

  // Generar token: raw (email) + hash (almacenado)
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

  // En dev, devolver la URL para facilitar pruebas
  const isDev = process.env.NODE_ENV === 'development'
  return NextResponse.json({
    ok: true,
    ...(isDev ? { magicUrl } : {}),
  })
}
