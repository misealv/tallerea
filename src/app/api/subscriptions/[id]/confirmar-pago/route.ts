import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, extractIdString } from '@/lib/auth'
import { SubscriptionService } from '@/services/SubscriptionService'
import { WorkshopService } from '@/services/WorkshopService'
import dbConnect from '@/lib/db'
import Subscription from '@/models/Subscription'
import { z } from 'zod'

const Schema = z.object({
  metodoPago:     z.enum(['transferencia', 'efectivo', 'otro']),
  montoDeclarado: z.number().int().min(0),
  nota:           z.string().max(300).optional(),
}).strict()

// POST /api/subscriptions/[id]/confirmar-pago
// Tallerista confirma que recibió pago externo → activa sub pendiente_pago
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    await dbConnect()

    const sub = await SubscriptionService.getById(params.id)
    if (!sub) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    if (sub.estado !== 'pendiente_pago') {
      return NextResponse.json(
        { error: `La suscripción está en estado '${sub.estado}', solo se puede confirmar si está pendiente_pago` },
        { status: 400 }
      )
    }

    // Solo tallerista dueño del taller o admin
    if (session.user.role !== 'admin') {
      const workshop = await WorkshopService.getByIdIncludingInactive(extractIdString(sub.workshopId))
      const ownerId = workshop ? extractIdString((workshop as { ownerId?: unknown }).ownerId) : null
      if (!ownerId || ownerId !== session.user.id) {
        return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
      }
    }

    const { metodoPago, montoDeclarado, nota } = parsed.data

    const updated = await Subscription.findByIdAndUpdate(
      params.id,
      {
        $set: {
          estado: 'activa',
          // Registrar pago externo en clasesPrepagadas — appends info, no crea PaymentBreakdown
          // (es pago manual, no fluye por MP, no genera breakdown financiero)
          'clasesPrepagadas.fechaPago':      new Date(),
          'clasesPrepagadas.metodoPago':     metodoPago,
          'clasesPrepagadas.montoDeclarado': montoDeclarado,
          ...(nota ? { 'clasesPrepagadas.notaTallerista': nota } : {}),
          ...(nota ? { notaPrecioEspecial: nota } : {}),
        },
      },
      { new: true, runValidators: true }
    ).lean()

    return NextResponse.json(updated)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
