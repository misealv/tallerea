import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { BookingService } from '@/services/BookingService'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

const ReservarParaAlumnoSchema = z.object({
  subscriptionId: z.string().min(1),
  slotIndex:      z.number().int().min(0),
}).strict()

// POST /api/tallerista/bookings
// El tallerista reserva una clase a nombre de un alumno con suscripción activa.
// Ownership verificado dentro de BookingService.reserveByTallerista.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parsed = ReservarParaAlumnoSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación fallida', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const booking = await BookingService.reserveByTallerista(
      session.user.id,
      parsed.data.subscriptionId,
      parsed.data.slotIndex
    )

    revalidatePath('/tallerista/inscritos')
    revalidatePath('/tallerista/calendario')

    return NextResponse.json(booking, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status = message.includes('Forbidden') || message.includes('acceso') ? 403
      : message.includes('llena') || message.includes('disponibles') || message.includes('activa') ? 409
      : message.includes('encontrada') ? 404
      : 400
    return NextResponse.json({ error: message }, { status })
  }
}
