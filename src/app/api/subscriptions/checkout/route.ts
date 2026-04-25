import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SubscriptionService } from '@/services/SubscriptionService'
import { validateObjectId } from '@/lib/validate'
import { findOrCreateGuestUser } from '@/lib/guestUser'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /api/subscriptions/checkout — crea suscripción + preferencia MercadoPago
// Acepta sesión activa O checkout invitado (name + email) → el alumno nace de la transacción
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  try {
    const body = await req.json()
    const { workshopId, paqueteId, name, email } = body

    if (!workshopId || !validateObjectId(workshopId)) {
      return NextResponse.json({ error: 'workshopId inválido' }, { status: 400 })
    }
    if (paqueteId && !validateObjectId(paqueteId)) {
      return NextResponse.json({ error: 'paqueteId inválido' }, { status: 400 })
    }

    let studentId: string
    let studentEmail: string

    if (session?.user?.id && session.user.email) {
      studentId = session.user.id
      studentEmail = session.user.email
    } else {
      // Invitado: alumno nace de la transacción
      if (!name?.trim() || !email?.trim()) {
        return NextResponse.json(
          { error: 'Ingresa tu nombre y email para continuar' },
          { status: 400 }
        )
      }
      if (!EMAIL_RE.test(email.trim())) {
        return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
      }
      const guest = await findOrCreateGuestUser(name.trim(), email.trim())
      studentId = guest.userId
      studentEmail = guest.email
    }

    const result = await SubscriptionService.createWithPayment(
      workshopId,
      studentId,
      studentEmail,
      paqueteId ?? undefined,
    )

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
