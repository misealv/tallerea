import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { paymentClient, getAuthorizedPayment } from '@/lib/mercadopago'
import { PaymentService } from '@/services/PaymentService'

export const dynamic = 'force-dynamic'

// POST /api/payments/webhook — recibe notificación de MercadoPago
export async function POST(req: NextRequest) {
  try {
    // Validar firma del webhook
    const xSignature = req.headers.get('x-signature') || ''
    const xRequestId = req.headers.get('x-request-id') || ''
    const { searchParams } = new URL(req.url)
    const dataId = searchParams.get('data.id') || ''

    if (!process.env.MP_WEBHOOK_SECRET) {
      console.error('[WEBHOOK] MP_WEBHOOK_SECRET no configurado')
      return NextResponse.json({ error: 'Configuración inválida' }, { status: 500 })
    }

    const parts = xSignature.split(',').reduce((acc: Record<string, string>, part) => {
      const [key, value] = part.trim().split('=')
      if (key && value) acc[key] = value
      return acc
    }, {})

    const ts = parts['ts']
    const hash = parts['v1']
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
    const expected = crypto
      .createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
      .update(manifest)
      .digest('hex')

    if (hash !== expected) {
      return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
    }

    const body = await req.json()

    // ─────────────────────────────────────────────────────────────────
    // [PAGO AUTOMÁTICO] subscription_preapproval — sincroniza estado del mandato
    // ─────────────────────────────────────────────────────────────────
    if (body.type === 'subscription_preapproval') {
      const preapprovalId = body.data?.id
      if (preapprovalId) {
        await PaymentService.handlePreapprovalStatusUpdate(String(preapprovalId))
      }
      return NextResponse.json({ ok: true })
    }

    // ─────────────────────────────────────────────────────────────────
    // [PAGO AUTOMÁTICO] subscription_authorized_payment — cobro recurrente
    // ─────────────────────────────────────────────────────────────────
    if (body.type === 'subscription_authorized_payment') {
      const authorizedPaymentId = body.data?.id
      if (!authorizedPaymentId) return NextResponse.json({ ok: true })

      const ap = await getAuthorizedPayment(String(authorizedPaymentId))

      // [PAGO AUTOMÁTICO] Resolver subscriptionId para cualquier estado relevante
      let subscriptionId: string | undefined
      const apAny = ap as unknown as Record<string, unknown>
      const extRef = typeof apAny['external_reference'] === 'string'
        ? (apAny['external_reference'] as string)
        : undefined
      if (extRef?.startsWith('pa:')) {
        subscriptionId = extRef.slice(3)
      } else if (ap.preapproval_id) {
        const { default: Subscription } = await import('@/models/Subscription')
        const sub = await Subscription.findOne({ mpPreapprovalId: ap.preapproval_id })
          .select('_id').lean<{ _id: { toString(): string } }>()
        subscriptionId = sub?._id?.toString()
      }

      // Cobro rechazado → incrementar intentos / degradar
      if (ap.status === 'rejected') {
        if (subscriptionId) {
          await PaymentService.handleRejectedRecurringPayment(subscriptionId, String(authorizedPaymentId))
        }
        return NextResponse.json({ ok: true })
      }

      if (ap.status !== 'processed') return NextResponse.json({ ok: true })

      if (!subscriptionId) return NextResponse.json({ ok: true })

      // comisionMP = suma de fee_details (informativo; no entra en la ecuación financiera)
      const comisionMP = (ap.fee_details ?? [])
        .reduce((sum, f) => sum + (f.amount ?? 0), 0)

      await PaymentService.handleAuthorizedRecurringPayment(
        subscriptionId,
        String(authorizedPaymentId),
        ap.transaction_amount,
        Math.round(comisionMP),
      )

      return NextResponse.json({ ok: true })
    }

    // ─────────────────────────────────────────────────────────────────
    // Pagos únicos (checkout pro / payment.created / payment.updated)
    // ─────────────────────────────────────────────────────────────────
    const isPayment = body.type === 'payment'
    const isPaymentAction = body.action === 'payment.created' || body.action === 'payment.updated'
    if (!isPayment && !isPaymentAction) {
      return NextResponse.json({ ok: true })
    }

    const paymentId = body.data?.id
    if (!paymentId) return NextResponse.json({ ok: true })

    // Consultar el pago en MercadoPago
    const payment = await paymentClient.get({ id: paymentId })

    if (payment.status === 'approved' && payment.external_reference) {
      const ref = payment.external_reference
      // Rutear según prefijo: 'enr:<id>' | 'sub:<id>' | 'rec:<subId>:<paqueteId>' | 'prn:<subId>'.
      // Sin prefijo asume enrollment (legacy)
      if (ref.startsWith('rec:')) {
        const [subId, paqueteId] = ref.slice(4).split(':')
        if (subId && paqueteId) {
          await PaymentService.handleApprovedRecarga(subId, paqueteId, String(paymentId))
        }
      } else if (ref.startsWith('prn:')) {
        // Prepaid renewal: renovación al precio acordado (precioSnapshot), suma sesiones a sub activa
        const subId = ref.slice(4)
        if (subId) {
          await PaymentService.handleApprovedPrepaidRenewal(subId, String(paymentId))
        }
      } else if (ref.startsWith('sub:')) {
        await PaymentService.handleApprovedSubscription(ref.slice(4), String(paymentId))
      } else if (ref.startsWith('enr:')) {
        await PaymentService.handleApprovedPayment(ref.slice(4), String(paymentId))
      } else {
        await PaymentService.handleApprovedPayment(ref, String(paymentId))
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[WEBHOOK_ERROR]', msg)
    // Errores de negocio conocidos (idempotencia, recurso no encontrado) → 200 para no reintentar
    // Errores transitorios (DB caída, timeout, red) → 500 para que MP reintente automáticamente
    const isBusinessError = msg.includes('not found') || msg.includes('no encontrad') || msg.includes('estado') || msg.includes('Forbidden')
    if (isBusinessError) return NextResponse.json({ ok: true })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
