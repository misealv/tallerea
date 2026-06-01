import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, extractIdString } from '@/lib/auth'
import { SubscriptionService } from '@/services/SubscriptionService'
import { WorkshopService } from '@/services/WorkshopService'
import dbConnect from '@/lib/db'
import Subscription from '@/models/Subscription'
import { z } from 'zod'

const Schema = z.object({
  metodoPago:      z.enum(['transferencia', 'efectivo', 'otro']),
  montoDeclarado:  z.number().int().min(0),
  nota:            z.string().max(300).optional(),
  // Opcional: sobreescribir cantidad de clases y fecha de vencimiento
  clasesCantidad:  z.number().int().min(1).optional(),
  fechaVencimiento: z.string().optional(), // YYYY-MM-DD
}).strict()

// POST /api/subscriptions/[id]/renovar-externo
// Desde una sub vencida (o cancelada manual), crea una nueva sub activa
// heredando todos los datos del ciclo anterior. No genera MP preference.
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

    const prev = await SubscriptionService.getById(params.id)
    if (!prev) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    if (prev.estado !== 'vencida' && prev.estado !== 'cancelada') {
      return NextResponse.json(
        { error: `Solo se puede renovar una suscripción vencida o cancelada (estado actual: '${prev.estado}')` },
        { status: 400 }
      )
    }

    // Solo tallerista dueño del taller o admin
    if (session.user.role !== 'admin') {
      const workshop = await WorkshopService.getByIdIncludingInactive(extractIdString(prev.workshopId))
      const ownerId = workshop ? extractIdString((workshop as { ownerId?: unknown }).ownerId) : null
      if (!ownerId || ownerId !== session.user.id) {
        return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
      }
    }

    const { metodoPago, montoDeclarado, nota, clasesCantidad, fechaVencimiento } = parsed.data

    const sesiones = clasesCantidad ?? prev.sesionesTotales
    const now = new Date()
    let vencimiento: Date
    if (fechaVencimiento) {
      vencimiento = new Date(fechaVencimiento + 'T23:59:59.000Z')
    } else {
      // Calcular +1 mes desde hoy
      vencimiento = new Date(now)
      vencimiento.setMonth(vencimiento.getMonth() + 1)
    }

    const nuevaSub = await new Subscription({
      workshopId:              prev.workshopId,
      studentId:               prev.studentId,
      estado:                  'activa',
      sesionesTotales:         sesiones,
      sesionesUsadas:          0,
      sesionesDisponibles:     sesiones,
      fechaCompra:             now,
      fechaVencimiento:        vencimiento,
      monto:                   prev.precioSnapshot ?? prev.monto,
      autoRenovar:             false,
      renovadaDesdeId:         prev._id,
      // Heredar paquete snapshot
      ...(prev.paqueteId ? {
        paqueteId:                 prev.paqueteId,
        paqueteNombreSnapshot:     prev.paqueteNombreSnapshot,
        precioSnapshot:            prev.precioSnapshot,
        sesionesPorPeriodoSnapshot: prev.sesionesPorPeriodoSnapshot,
      } : {
        precioEspecial:    true,
        precioSnapshot:    prev.precioSnapshot ?? prev.monto,
        notaPrecioEspecial: prev.notaPrecioEspecial,
      }),
      // Heredar dependiente
      ...(prev.dependentId ? {
        dependentId:             prev.dependentId,
        dependentNombreSnapshot: prev.dependentNombreSnapshot,
      } : {}),
      origenInscripcion: 'manual',
      inscritoPor:       extractIdString(session.user.id),
      activo:            true,
      clasesPrepagadas: {
        cantidad:        sesiones,
        consumidas:      0,
        fechaPago:       now,
        metodoPago,
        montoDeclarado,
        ...(nota ? { notaTallerista: nota } : {}),
        creadoPor:       extractIdString(session.user.id),
      },
    }).save()

    return NextResponse.json(nuevaSub, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
