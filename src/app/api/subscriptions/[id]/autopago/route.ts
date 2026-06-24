import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { SubscriptionService } from '@/services/SubscriptionService'
import dbConnect from '@/lib/db'
import Subscription from '@/models/Subscription'
import type { ISubscription } from '@/models/Subscription'

// Validación del body de activación
const ActivarSchema = z.object({
  cardTokenId: z.string().min(1, 'cardTokenId requerido'),
  cardLast4: z.string().regex(/^[\d*]{4}$/, 'cardLast4 debe tener 4 caracteres'),
}).strict()

/** POST — activa el mandato preapproval */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Validar input con Zod
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const parsed = ActivarSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Input inválido' },
      { status: 400 }
    )
  }

  const subId = params.id

  // Ownership: la suscripción debe pertenecer al usuario autenticado
  await dbConnect()
  const sub = await Subscription.findById(subId).select('studentId').lean<{ studentId: unknown }>()
  if (!sub) {
    return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
  }
  if (String(sub.studentId) !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    const updated = await SubscriptionService.activarPagoAutomatico(
      subId,
      parsed.data.cardTokenId,
      parsed.data.cardLast4,
    )

    // Devolver solo campos seguros al cliente
    return NextResponse.json({
      pagoAutomatico: updated.pagoAutomatico,
      mpPreapprovalStatus: updated.mpPreapprovalStatus,
      cardLast4: updated.cardLast4,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    // Distinguir errores de validación del service vs errores de MP
    const isMpError = message.includes('[MP]')
    return NextResponse.json(
      { error: isMpError ? 'Tarjeta rechazada o inválida. Verifica los datos e intenta de nuevo.' : message },
      { status: isMpError ? 422 : 500 }
    )
  }
}

/** DELETE — desactiva el mandato */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const subId = params.id

  // Ownership
  await dbConnect()
  const sub = await Subscription.findById(subId).select('studentId').lean<{ studentId: unknown }>()
  if (!sub) {
    return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
  }
  if (String(sub.studentId) !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    await SubscriptionService.desactivarPagoAutomatico(subId)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const PatchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pausar') }).strict(),
  z.object({ action: z.literal('reactivar') }).strict(),
  z.object({
    action: z.literal('cambiar-tarjeta'),
    cardTokenId: z.string().min(1, 'cardTokenId requerido'),
    cardLast4: z.string().regex(/^\d{4}$/, 'cardLast4 debe tener 4 dígitos'),
  }).strict(),
])

/** PATCH — pausar / reactivar / cambiar tarjeta */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Input inválido' },
      { status: 400 }
    )
  }

  const subId = params.id
  await dbConnect()
  const sub = await Subscription.findById(subId).select('studentId').lean<{ studentId: unknown }>()
  if (!sub) return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
  if (String(sub.studentId) !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    let updated: ISubscription
    if (parsed.data.action === 'pausar') {
      updated = await SubscriptionService.pausarPagoAutomatico(subId)
    } else if (parsed.data.action === 'reactivar') {
      updated = await SubscriptionService.reactivarPagoAutomatico(subId)
    } else {
      updated = await SubscriptionService.cambiarTarjetaAutopago(
        subId, parsed.data.cardTokenId, parsed.data.cardLast4,
      )
    }
    return NextResponse.json({
      pagoAutomatico: updated.pagoAutomatico,
      mpPreapprovalStatus: updated.mpPreapprovalStatus,
      cardLast4: updated.cardLast4,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const isMpError = message.includes('[MP]')
    return NextResponse.json(
      { error: isMpError ? 'Error con la tarjeta. Verifica los datos e intenta de nuevo.' : message },
      { status: isMpError ? 422 : 500 }
    )
  }
}
