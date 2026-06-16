import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, extractIdString } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Subscription from '@/models/Subscription'
import { SubscriptionService } from '@/services/SubscriptionService'

// POST /api/subscriptions/[id]/renovar-acordado
// Self-service del alumno: renueva su suscripción al PRECIO ACORDADO (precioSnapshot)
// sumando la misma cantidad de clases del ciclo. Devuelve el initPoint de MercadoPago.
// El alumno solo puede renovar SUS PROPIAS suscripciones (scope por studentId).
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    await dbConnect()

    // Ownership: la suscripción debe pertenecer al alumno autenticado
    const sub = await Subscription.findById(params.id).select('studentId').lean<{ studentId: object } | null>()
    if (!sub) return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
    if (extractIdString(sub.studentId) !== session.user.id) {
      return NextResponse.json({ error: 'No puedes renovar esta suscripción' }, { status: 403 })
    }

    const result = await SubscriptionService.createRenewalPreferenceAtAgreedPrice(params.id)
    return NextResponse.json(result, { status: 201 })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const is400 = ['activa', 'acordado', 'clases por ciclo', 'sin email'].some(p => message.includes(p))
    return NextResponse.json({ error: message }, { status: is400 ? 400 : 500 })
  }
}
