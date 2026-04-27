import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import dbConnect from '@/lib/db'
import Subscription from '@/models/Subscription'
import Workshop from '@/models/Workshop'
import FinanceAuditLog from '@/models/FinanceAuditLog'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

const EditarPrecioSchema = z.object({
  precioSnapshot:     z.number().int().min(0),
  notaPrecioEspecial: z.string().min(1, 'La razón es obligatoria').max(500),
}).strict()

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parsed = EditarPrecioSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación fallida', details: parsed.error.flatten() }, { status: 400 })
  }

  await dbConnect()

  const sub = await Subscription.findOne({ _id: params.id, activo: true })
  if (!sub) return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })

  // Ownership: solo el ownerId del taller o admin
  const workshop = await Workshop.findById(sub.workshopId).select('ownerId accountId').lean<{ ownerId?: Types.ObjectId; accountId?: Types.ObjectId }>()
  if (!workshop) return NextResponse.json({ error: 'Taller no encontrado' }, { status: 404 })
  const ownerId = String(workshop.ownerId ?? workshop.accountId ?? '')
  if (session.user.role !== 'admin' && ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const montoAnterior = sub.precioSnapshot ?? 0

  // [FINANCE RISK] Actualizar precioSnapshot + marcar precioEspecial=true
  sub.precioSnapshot       = parsed.data.precioSnapshot
  sub.precioEspecial       = true
  sub.notaPrecioEspecial   = parsed.data.notaPrecioEspecial
  await sub.save()

  // [FINANCE RISK] Auditar cambio — append-only
  await FinanceAuditLog.create({
    accion:       'precio_especial_editado',
    entidadTipo:  'Subscription',
    entidadId:    sub._id,
    montoAnterior,
    montoNuevo:   parsed.data.precioSnapshot,
    userId:       new Types.ObjectId(session.user.id),
    metadata: {
      razon:                parsed.data.notaPrecioEspecial,
      workshopId:           String(sub.workshopId),
      studentId:            String(sub.studentId),
    },
  })

  return NextResponse.json({ ok: true, precioSnapshot: sub.precioSnapshot })
}
