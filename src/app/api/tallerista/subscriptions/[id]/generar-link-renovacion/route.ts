import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, extractIdString } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Subscription from '@/models/Subscription'
import Workshop from '@/models/Workshop'
import { createPaymentPreference } from '@/lib/mercadopago'
import User from '@/models/User'

// POST /api/tallerista/subscriptions/[id]/generar-link-renovacion
// Genera un link MP (prn:subId) para cobrar al alumno el precioSnapshot acordado.
// El webhook handleApprovedPrepaidRenewal suma las clases al saldo existente.
// Úsalo cuando el alumno agotó sus clases y quieres cobrarle el mismo precio especial.
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tallerEstado = (session.user as { tallerEstado?: string }).tallerEstado
  if (session.user.role !== 'admin' && tallerEstado !== 'aprobado') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await dbConnect()

    const sub = await Subscription.findById(params.id).lean<{
      _id: object
      workshopId: object
      studentId: object
      estado: string
      precioSnapshot?: number
      monto: number
      clasesPrepagadas?: { cantidad: number }
    }>()
    if (!sub) return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
    if (sub.estado !== 'activa') {
      return NextResponse.json({ error: `La suscripción está en estado '${sub.estado}', solo se puede generar link para suscripciones activas` }, { status: 400 })
    }

    const monto = sub.precioSnapshot ?? sub.monto
    if (!monto || monto <= 0) {
      return NextResponse.json({ error: 'Esta suscripción no tiene precio acordado mayor a $0. Edita el precio especial primero.' }, { status: 400 })
    }

    // Verificar ownership del taller
    const workshop = await Workshop.findById(sub.workshopId).select('ownerId titulo').lean<{
      ownerId: object; titulo: string
    }>()
    if (!workshop) return NextResponse.json({ error: 'Taller no encontrado' }, { status: 404 })
    if (session.user.role !== 'admin' && extractIdString(workshop.ownerId) !== session.user.id) {
      return NextResponse.json({ error: 'Sin permiso sobre este taller' }, { status: 403 })
    }

    const student = await User.findById(sub.studentId).select('email name').lean<{ email: string; name: string }>()
    if (!student?.email) return NextResponse.json({ error: 'Alumno sin email' }, { status: 400 })

    const cantidad = sub.clasesPrepagadas?.cantidad ?? 4

    const preference = await createPaymentPreference({
      externalRef: `prn:${params.id}`,
      workshopTitle: `${workshop.titulo} — ${cantidad} clases`,
      amount: monto,
      payerEmail: student.email,
    })

    if (!preference?.init_point) {
      return NextResponse.json({ error: 'No se pudo generar el link de MercadoPago' }, { status: 500 })
    }

    return NextResponse.json({
      initPoint: preference.init_point,
      monto,
      cantidad,
      studentName: student.name,
      studentEmail: student.email,
    }, { status: 201 })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
