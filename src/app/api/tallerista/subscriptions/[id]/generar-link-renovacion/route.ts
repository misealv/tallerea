import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, extractIdString } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Subscription from '@/models/Subscription'
import Workshop from '@/models/Workshop'
import { SubscriptionService } from '@/services/SubscriptionService'

// POST /api/tallerista/subscriptions/[id]/generar-link-renovacion
// Genera un link MP (prn:subId) para cobrar al alumno el precioSnapshot acordado.
// El webhook handleApprovedPrepaidRenewal suma las clases al saldo existente.
// Respaldo manual: el camino principal es self-service del alumno en su panel.
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tallerEstado = (session.user as { tallerEstado?: string }).tallerEstado
  if (session.user.role !== 'admin' && tallerEstado !== 'aprobado') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await dbConnect()

    // Autorización: el tallerista debe ser dueño del taller de esta suscripción
    const sub = await Subscription.findById(params.id).select('workshopId').lean<{ workshopId: object } | null>()
    if (!sub) return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })

    const workshop = await Workshop.findById(sub.workshopId).select('ownerId').lean<{ ownerId: object } | null>()
    if (!workshop) return NextResponse.json({ error: 'Taller no encontrado' }, { status: 404 })
    if (session.user.role !== 'admin' && extractIdString(workshop.ownerId) !== session.user.id) {
      return NextResponse.json({ error: 'Sin permiso sobre este taller' }, { status: 403 })
    }

    const result = await SubscriptionService.createRenewalPreferenceAtAgreedPrice(params.id)
    return NextResponse.json(result, { status: 201 })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const is400 = ['activa', 'acordado', 'clases por ciclo', 'sin email'].some(p => message.includes(p))
    return NextResponse.json({ error: message }, { status: is400 ? 400 : 500 })
  }
}
