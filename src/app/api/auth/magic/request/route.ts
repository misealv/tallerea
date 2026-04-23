import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import User from '@/models/User'
import { sendMagicLink } from '@/lib/resend'
import { issueMagicLink } from '@/lib/issueMagicLink'

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

  const { magicUrl } = await issueMagicLink(String(user._id))
  await sendMagicLink({ email, magicUrl })

  return NextResponse.json({
    ok: true,
    ...(isDev ? { magicUrl } : {}),
  })
}
