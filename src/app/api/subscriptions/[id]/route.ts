import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, extractIdString } from '@/lib/auth'
import { SubscriptionService } from '@/services/SubscriptionService'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const sub = await SubscriptionService.getById(params.id)
    if (!sub) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    // Solo el alumno dueño o admin puede ver. studentId puede venir populado.
    if (session.user.role !== 'admin' && extractIdString(sub.studentId) !== session.user.id) {
      return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
    }

    return NextResponse.json(sub)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Cancelar suscripción
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const sub = await SubscriptionService.getById(params.id)
    if (!sub) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    if (session.user.role !== 'admin' && extractIdString(sub.studentId) !== session.user.id) {
      return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
    }

    await SubscriptionService.cancel(params.id)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
