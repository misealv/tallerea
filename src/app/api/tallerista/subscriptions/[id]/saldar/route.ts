import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { SubscriptionService } from '@/services/SubscriptionService'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  metodoPagoFinal: z.enum(['transferencia', 'efectivo', 'mercadopago']),
}).strict()

// POST /api/tallerista/subscriptions/[id]/saldar
// [FIADO] Salda una deuda a confianza. transferencia/efectivo → marca pagada
// sin comisión. mercadopago → devuelve initPoint; el webhook salda al confirmar.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tallerEstado = (session.user as { tallerEstado?: string }).tallerEstado
  const isAdmin = session.user.role === 'admin'
  if (!isAdmin && tallerEstado !== 'aprobado') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const result = await SubscriptionService.saldarDeuda({
      subscriptionId:  params.id,
      ownerId:         session.user.id,
      isAdmin,
      metodoPagoFinal: parsed.data.metodoPagoFinal,
    })
    revalidatePath('/tallerista/inscritos')
    return NextResponse.json(result, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const knownPrefixes = ['[FIADO]', 'Suscripción no encontrada', 'Taller no encontrado', 'No tienes permiso', 'sin email']
    const is400 = knownPrefixes.some(p => message.includes(p))
    return NextResponse.json({ error: message }, { status: is400 ? 400 : 500 })
  }
}
