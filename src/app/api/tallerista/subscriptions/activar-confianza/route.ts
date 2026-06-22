import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { SubscriptionService } from '@/services/SubscriptionService'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  workshopId:               z.string().min(24).max(24),
  studentEmail:             z.string().email(),
  studentNombre:            z.string().min(2).max(100),
  dependentNombre:          z.string().min(2).max(100).optional(),
  dependentFechaNacimiento: z.coerce.date().optional(),
  dependentNotas:           z.string().max(300).optional(),
  cantidadClases:           z.number().int().min(1).optional(),
  montoAdeudado:            z.number().int().min(1),
  fechaCompromiso:          z.coerce.date().optional(),
  nota:                     z.string().max(500).optional(),
}).strict()

// POST /api/tallerista/subscriptions/activar-confianza
// [FIADO] Activa una suscripción a confianza: acceso inmediato con deuda registrada.
// NO genera PaymentBreakdown. La deuda se salda luego vía /saldar.
export async function POST(req: NextRequest) {
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

  const d = parsed.data

  try {
    const subscription = await SubscriptionService.activarAConfianza({
      ownerId:                  session.user.id,
      isAdmin,
      workshopId:               d.workshopId,
      studentEmail:             d.studentEmail,
      studentNombre:            d.studentNombre,
      dependentNombre:          d.dependentNombre,
      dependentFechaNacimiento: d.dependentFechaNacimiento,
      dependentNotas:           d.dependentNotas,
      cantidadClases:           d.cantidadClases,
      montoAdeudado:            d.montoAdeudado,
      fechaCompromiso:          d.fechaCompromiso,
      nota:                     d.nota,
    })
    revalidatePath(`/tallerista/talleres/${d.workshopId}/inscritos`)
    revalidatePath('/talleres')
    return NextResponse.json({ subscription }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const knownPrefixes = ['[FIADO]', '[FINANCE', 'Taller no encontrado', 'No tienes permiso', 'ya tiene una suscripción']
    const is400 = knownPrefixes.some(p => message.includes(p))
    return NextResponse.json({ error: message }, { status: is400 ? 400 : 500 })
  }
}
