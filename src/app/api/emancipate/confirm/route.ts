import { NextRequest, NextResponse } from 'next/server'
import { UserService } from '@/services/UserService'
import { z } from 'zod'

const ConfirmSchema = z.object({
  token: z.string().min(1),
})

// POST /api/emancipate/confirm
// Confirma la emancipación: crea la cuenta del dependiente y le envía magic link.
// No requiere sesión — el apoderado confirma desde el link del email.
export async function POST(req: NextRequest) {
  const parsed = ConfirmSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
  }

  try {
    const result = await UserService.confirmEmancipation(parsed.data.token)
    return NextResponse.json({
      message: `Cuenta creada para ${result.dependentNombre}. Se envió un enlace de acceso a ${result.newEmail}.`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status = message.includes('inválido') || message.includes('expirado') ? 400 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
