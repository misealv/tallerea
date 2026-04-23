import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CreditService } from '@/services/CreditService'
import { RefundCreateSchema } from '@/schemas/refund'
import dbConnect from '@/lib/db'
import User from '@/models/User'
import Enrollment from '@/models/Enrollment'
import Subscription from '@/models/Subscription'

// POST /api/refunds — solo admin (usuario post-MVP)
// Otorga crédito a un alumno como reembolso o compensación
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Solo administradores pueden emitir reembolsos' }, { status: 403 })
  }

  const parsed = RefundCreateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { userId, monto, origenTipo, enrollmentId, subscriptionId, motivo } = parsed.data

  // [FINANCE RISK] Validación: monto entero positivo (también en Zod, doble capa)
  if (!Number.isInteger(monto) || monto <= 0) {
    return NextResponse.json({ error: 'monto debe ser entero positivo en CLP' }, { status: 400 })
  }

  // Validar destinatario: debe existir, estar activo y tener rol 'user' (no admin/otro admin)
  await dbConnect()
  const destinatario = await User.findById(userId).select('role activo').lean<{ role: string; activo: boolean }>()
  if (!destinatario || !destinatario.activo) {
    return NextResponse.json({ error: 'Usuario destinatario no encontrado' }, { status: 404 })
  }
  if (destinatario.role !== 'user') {
    return NextResponse.json({ error: 'El destinatario no es un alumno' }, { status: 400 })
  }

  // Si se provee enrollmentId/subscriptionId, validar que pertenezca al destinatario
  if (enrollmentId) {
    const enr = await Enrollment.findById(enrollmentId).select('studentId').lean<{ studentId: { toString(): string } }>()
    if (!enr) return NextResponse.json({ error: 'enrollmentId no encontrado' }, { status: 404 })
    if (enr.studentId.toString() !== userId) {
      return NextResponse.json({ error: 'enrollmentId no pertenece al destinatario' }, { status: 400 })
    }
  }
  if (subscriptionId) {
    const sub = await Subscription.findById(subscriptionId).select('studentId').lean<{ studentId: { toString(): string } }>()
    if (!sub) return NextResponse.json({ error: 'subscriptionId no encontrado' }, { status: 404 })
    if (sub.studentId.toString() !== userId) {
      return NextResponse.json({ error: 'subscriptionId no pertenece al destinatario' }, { status: 400 })
    }
  }

  try {
    const tx = await CreditService.otorgar({
      userId,
      monto,
      origenTipo,
      enrollmentId,
      subscriptionId,
      adminId: session.user.id,
      motivo,
    })
    return NextResponse.json(tx, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
