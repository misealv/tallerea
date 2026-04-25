import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { paymentClient } from '@/lib/mercadopago'
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

    // Procesar notificaciones de pago: created y updated (pagos diferidos: transferencia, etc.)
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
      // Rutear según prefijo: 'enr:<id>' o 'sub:<id>'. Sin prefijo asume enrollment (legacy)
      if (ref.startsWith('sub:')) {
        await PaymentService.handleApprovedSubscription(ref.slice(4), String(paymentId))
      } else if (ref.startsWith('enr:')) {
        await PaymentService.handleApprovedPayment(ref.slice(4), String(paymentId))
      } else {
        await PaymentService.handleApprovedPayment(ref, String(paymentId))
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[WEBHOOK_ERROR]', error instanceof Error ? error.message : error)
    // Siempre retornar 200 para que MercadoPago no reintente
    return NextResponse.json({ ok: true })
  }
}
