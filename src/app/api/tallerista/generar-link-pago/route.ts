import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SubscriptionService } from '@/services/SubscriptionService'
import { z } from 'zod'

const Schema = z.object({
  workshopId:              z.string().min(1),
  studentEmail:            z.string().email(),
  studentNombre:           z.string().min(1),
  dependentNombre:         z.string().min(1),
  dependentFechaNacimiento: z.string().optional(),
  precioAcordado:          z.number().int().positive(),
  notaPrecio:              z.string().optional(),
  clasesCantidad:          z.number().int().min(1),
  caducaEn:                z.string().optional(), // ISO date string
}).strict()

// POST /api/tallerista/generar-link-pago
// Genera una suscripción pendiente_pago + preferencia MP con precio especial acordado.
// El webhook activa la sub con las clases prepagadas configuradas.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Solo talleristas aprobados o admins
  const tallerEstado = (session.user as { tallerEstado?: string }).tallerEstado
  if (session.user.role !== 'admin' && tallerEstado !== 'aprobado') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación', details: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data

  try {
    const result = await SubscriptionService.createManualPendingPayment({
      workshopId:               d.workshopId,
      ownerId:                  session.user.id,
      studentEmail:             d.studentEmail,
      studentNombre:            d.studentNombre,
      dependentNombre:          d.dependentNombre,
      dependentFechaNacimiento: d.dependentFechaNacimiento,
      precioAcordado:           d.precioAcordado,
      notaPrecio:               d.notaPrecio,
      clasesCantidad:           d.clasesCantidad,
      caducaEn:                 d.caducaEn ? new Date(d.caducaEn) : undefined,
    })

    if (!result.initPoint) {
      return NextResponse.json({ error: 'No se pudo generar el link de MercadoPago' }, { status: 500 })
    }

    return NextResponse.json({
      initPoint:      result.initPoint,
      subscriptionId: result.subscriptionId,
    }, { status: 201 })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const knownPrefixes = ['[FINANCE]', '[PREPAGADO]', 'Ya existe', 'ya tiene', 'Sin permiso', 'no encontrado']
    const is400 = knownPrefixes.some(p => message.includes(p))
    return NextResponse.json({ error: message }, { status: is400 ? 400 : 500 })
  }
}
