import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import User from '@/models/User'

const SetPasswordSchema = z.object({
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const parsed = SetPasswordSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validación fallida' },
      { status: 400 }
    )
  }

  try {
    await dbConnect()
    const hash = await bcrypt.hash(parsed.data.password, 12)
    const updated = await User.findByIdAndUpdate(
      session.user.id,
      { password: hash },
      { new: false }
    )
    if (!updated) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
