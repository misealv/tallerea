import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { SubscriptionService } from '@/services/SubscriptionService'

const RecargarSchema = z.object({
  paqueteId: z.string().min(1),
}).strict()

// POST /api/subscriptions/[id]/recargar
// Genera preferencia MercadoPago para recargar el saldo de una suscripción activa
// con el paquete seleccionado. El webhook acreditará las clases al confirmar el pago.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const parsed = RecargarSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validación', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const result = await SubscriptionService.createRechargePreference(
      params.id,
      parsed.data.paqueteId,
      session.user.id,
    )
    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status = message === 'Forbidden' ? 403
      : message.includes('no encontrad') ? 404
      : 400
    return NextResponse.json({ error: message }, { status })
  }
}
