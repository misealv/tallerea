import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import User from '@/models/User'
import { sendMagicLink } from '@/lib/resend'
import { issueMagicLink } from '@/lib/issueMagicLink'
import { rateLimit, getClientIp } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  // Rate-limit: 5 solicitudes por IP cada 15 min (anti-abuso de envío de emails)
  const ip = getClientIp(req)
  const limited = rateLimit({ key: `magic:${ip}`, limit: 5, windowMs: 15 * 60 * 1000 })
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Intenta de nuevo en 15 minutos.' },
      { status: 429 }
    )
  }

  await dbConnect()

  // Solo usuarios existentes reciben magic link — los alumnos nacen de transacción (no por auto-registro)
  const user = await User.findOne({ email })

  const isDev = process.env.NODE_ENV === 'development'

  // Respuesta uniforme (anti-enumeración): siempre 200 ok, independiente de si el user existe
  if (!user || !user.activo) {
    return NextResponse.json({ ok: true })
  }

  const { magicUrl } = await issueMagicLink(String(user._id))
  await sendMagicLink({ email, magicUrl })

  return NextResponse.json({
    ok: true,
    ...(isDev ? { magicUrl } : {}),
  })
}
