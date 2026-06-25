import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SubscriptionService } from '@/services/SubscriptionService'

export const dynamic = 'force-dynamic'

// POST /api/alumno/subscriptions/[id]/pagar-fiado
// [FIADO] Genera link MP para que el alumno pague su deuda a confianza.
// Solo permite metodoPagoFinal='mercadopago' — el alumno no puede marcar
// pago en efectivo/transferencia (eso lo hace el tallerista).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const result = await SubscriptionService.saldarDeuda({
      subscriptionId:  params.id,
      ownerId:         session.user.id,
      metodoPagoFinal: 'mercadopago',
      isAlumno:        true,
      studentId:       session.user.id,
    })
    return NextResponse.json(result, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const is400 = ['[FIADO]', 'Suscripción no encontrada', 'No tienes permiso', 'sin email'].some(p => message.includes(p))
    return NextResponse.json({ error: message }, { status: is400 ? 400 : 500 })
  }
}
