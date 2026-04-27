import { NextRequest, NextResponse } from 'next/server'
import { paymentClient } from '@/lib/mercadopago'
import { PaymentService } from '@/services/PaymentService'
import dbConnect from '@/lib/db'
import EnrollmentModel from '@/models/Enrollment'
import User from '@/models/User'
import { issueMagicLink } from '@/lib/issueMagicLink'

export const dynamic = 'force-dynamic'

// POST /api/payments/verify
// Fallback al webhook: la página /pago/exitoso lo llama con el paymentId del redirect.
// Si el webhook ya procesó → operación es idempotente, retorna ok.
// Si el webhook nunca llegó (DNS, timeout, NEXTAUTH_URL mal configurado) → procesa acá.
// SIEMPRE devuelve magicUrl si el alumno es invitado — aunque el webhook haya llegado primero.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const paymentId = body?.paymentId || body?.payment_id
    const collectionId = body?.collection_id // MP a veces redirige con collection_id en lugar de payment_id

    const id = paymentId || collectionId
    if (!id) {
      return NextResponse.json({ error: 'paymentId requerido' }, { status: 400 })
    }

    // Consultar pago en MP
    const payment = await paymentClient.get({ id: String(id) })

    if (!payment) {
      return NextResponse.json({ error: 'Pago no encontrado en MercadoPago' }, { status: 404 })
    }

    const status = payment.status
    const ref = payment.external_reference

    if (status !== 'approved') {
      return NextResponse.json({ status, processed: false })
    }

    if (!ref) {
      return NextResponse.json({ error: 'Pago sin external_reference' }, { status: 400 })
    }

    // Rutear igual que el webhook (idempotente por diseño en handleApproved*)
    let magicUrl: string | undefined
    if (ref.startsWith('sub:')) {
      await PaymentService.handleApprovedSubscription(ref.slice(4), String(id))
    } else if (ref.startsWith('enr:')) {
      const result = await PaymentService.handleApprovedPayment(ref.slice(4), String(id))
      magicUrl = result.magicUrl
    } else {
      const result = await PaymentService.handleApprovedPayment(ref, String(id))
      magicUrl = result.magicUrl
    }

    // Si handleApprovedPayment retornó vacío (ya procesado por webhook), intentar emitir
    // magic link fresco para la página de éxito. No se re-envía email.
    if (!magicUrl && !ref.startsWith('sub:')) {
      try {
        await dbConnect()
        const enrollmentId = ref.startsWith('enr:') ? ref.slice(4) : ref
        const enrollment = await EnrollmentModel
          .findOne({ _id: enrollmentId, pagoRef: String(id) })
          .select('studentId')
          .lean<{ studentId: unknown }>()

        if (enrollment?.studentId) {
          const student = await User
            .findById(enrollment.studentId)
            .select('password')
            .lean<{ _id: unknown; password?: string }>()

          if (student && !student.password) {
            const result = await issueMagicLink(String(student._id))
            magicUrl = result.magicUrl
          }
        }
      } catch {
        // No bloquear — la inscripción ya fue procesada, solo falta mostrar el link
      }
    }

    return NextResponse.json({ status: 'approved', processed: true, ref, magicUrl })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    console.error('[VERIFY_ERROR]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
