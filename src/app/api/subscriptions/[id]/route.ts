import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, extractIdString } from '@/lib/auth'
import { SubscriptionService } from '@/services/SubscriptionService'
import { WorkshopService } from '@/services/WorkshopService'
import { z } from 'zod'

// [FINANCE RISK] Schema para edición de precio especial / fecha de vencimiento / paquete de clases
const AdminUpdateSchema = z.object({
  precioSnapshot:     z.number().int().nonnegative().optional(),
  fechaVencimiento:   z.string().datetime().optional(),
  notaPrecioEspecial: z.string().max(500).optional(),
  clasesCantidad:     z.number().int().min(1).optional(),  // nueva cantidad del paquete
  autoRenovar:        z.boolean().optional(),
}).strict()

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

// [FINANCE RISK] Solo tallerista dueño del workshop o admin puede editar precio/fecha/paquete
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parsed = AdminUpdateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const sub = await SubscriptionService.getById(params.id)
    if (!sub) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    // Solo se puede editar suscripciones activas o pendientes de pago
    if (sub.estado !== 'activa' && sub.estado !== 'pendiente_pago') {
      return NextResponse.json(
        { error: `No se puede editar una suscripción en estado '${sub.estado}'` },
        { status: 400 }
      )
    }

    // Verificar ownership: tallerista debe ser dueño del workshop (incluso si está archivado)
    if (session.user.role !== 'admin') {
      const workshop = await WorkshopService.getByIdIncludingInactive(extractIdString(sub.workshopId))
      const workshopOwnerId = workshop ? extractIdString((workshop as { ownerId?: unknown }).ownerId) : null
      if (!workshopOwnerId || workshopOwnerId !== session.user.id) {
        return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
      }
    }

    // [CICLO] fechaVencimiento debe ser futura
    let fechaVencimiento: Date | undefined
    if (parsed.data.fechaVencimiento) {
      fechaVencimiento = new Date(parsed.data.fechaVencimiento)
      if (fechaVencimiento.getTime() <= Date.now()) {
        return NextResponse.json({ error: 'fechaVencimiento debe ser futura' }, { status: 400 })
      }
    }

    const updated = await SubscriptionService.adminUpdate(params.id, {
      precioSnapshot:     parsed.data.precioSnapshot,
      fechaVencimiento,
      notaPrecioEspecial: parsed.data.notaPrecioEspecial,
      clasesCantidad:     parsed.data.clasesCantidad,
      autoRenovar:        parsed.data.autoRenovar,
    })
    return NextResponse.json(updated)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
