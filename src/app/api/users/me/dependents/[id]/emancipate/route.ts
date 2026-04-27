import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { UserService } from '@/services/UserService'
import { z } from 'zod'

const EmancipateSchema = z.object({
  email: z.string().email('Email inválido').max(254),
})

// POST /api/users/me/dependents/[id]/emancipate
// Inicia el flujo: valida datos, envía email de confirmación al apoderado.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parsed = EmancipateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email inválido', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    await UserService.initiateEmancipation(session.user.id, params.id, parsed.data.email)
    return NextResponse.json({ message: 'Revisa tu email para confirmar la emancipación' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
