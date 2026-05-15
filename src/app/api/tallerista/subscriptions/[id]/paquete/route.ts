import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SubscriptionService } from '@/services/SubscriptionService'
import { z } from 'zod'

const Body = z.object({
  cantidad:    z.number().int().min(1).optional(),
  precio:      z.number().int().positive().optional(),
  caducaEn:    z.union([z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)), z.null()]).optional(),
  notaPrecio:  z.union([z.string().max(500), z.null()]).optional(),
  autoRenovar: z.boolean().optional(),
}).strict()

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.user.tallerEstado !== 'aprobado' && session.user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = Body.safeParse(await req.json())
  if (!parsed.success)
    return NextResponse.json({ error: 'Validación', details: parsed.error.flatten() }, { status: 400 })

  try {
    const updated = await SubscriptionService.updatePaquete({
      subscriptionId: params.id,
      ownerId: session.user.id,
      cantidad: parsed.data.cantidad,
      precio: parsed.data.precio,
      caducaEn: parsed.data.caducaEn === null ? null : parsed.data.caducaEn ? new Date(parsed.data.caducaEn) : undefined,
      notaPrecio: parsed.data.notaPrecio === null ? null : parsed.data.notaPrecio,
      autoRenovar: parsed.data.autoRenovar,
    })
    return NextResponse.json({
      _id: String(updated._id),
      sesionesTotales: updated.sesionesTotales,
      sesionesUsadas: updated.sesionesUsadas,
      sesionesDisponibles: updated.sesionesDisponibles,
      precioSnapshot: updated.precioSnapshot,
      monto: updated.monto,
      caducaEn: updated.clasesPrepagadas?.caducaEn,
      autoRenovar: updated.autoRenovar,
      notaPrecioEspecial: updated.notaPrecioEspecial,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    const status = msg.includes('Sin permiso') ? 403
      : msg.includes('no encontrad') ? 404
      : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
