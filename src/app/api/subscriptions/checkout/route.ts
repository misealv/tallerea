import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SubscriptionService } from '@/services/SubscriptionService'
import { validateObjectId } from '@/lib/validate'

// POST /api/subscriptions/checkout — crea suscripción + preferencia MercadoPago
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Debes iniciar sesión para suscribirte' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { workshopId } = body

    if (!workshopId || !validateObjectId(workshopId)) {
      return NextResponse.json({ error: 'workshopId inválido' }, { status: 400 })
    }

    const result = await SubscriptionService.createWithPayment(
      workshopId,
      session.user.id,
      session.user.email
    )

    // Taller gratuito → redirigir a reservas directamente
    if (result.free) {
      return NextResponse.json({
        free: true,
        subscriptionId: String(result.subscription._id),
      })
    }

    return NextResponse.json({
      initPoint: result.initPoint,
      subscriptionId: String(result.subscription._id),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status = message.includes('activa') ? 409 : message.includes('máximo') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
