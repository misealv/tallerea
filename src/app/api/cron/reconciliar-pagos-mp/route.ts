import { NextRequest, NextResponse } from 'next/server'
import { PaymentService } from '@/services/PaymentService'
import dbConnect from '@/lib/db'
import PaymentBreakdown from '@/models/PaymentBreakdown'

export const dynamic = 'force-dynamic'

/**
 * [IDEMPOTENCIA] Vercel Cron Job: se ejecuta cada hora a los :30 min (UTC).
 * Consulta los pagos aprobados en MP en las últimas 26h y verifica que cada uno
 * tenga su PaymentBreakdown. Si encuentra huérfanos (pago en MP sin breakdown),
 * re-ejecuta el handler correspondiente según el prefijo de external_reference:
 *   rec:<subId>:<paqueteId>  → handleApprovedRecarga
 *   sub:<subId>              → handleApprovedSubscription
 *   enr:<enrollId>           → handleApprovedPayment
 *
 * Protegido con CRON_SECRET. Fail-closed: sin secret configurado, rechaza.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Ventana: últimas 26h (cubre cualquier pago perdido en la última ejecución horaria)
  const ahora = new Date()
  const desde = new Date(ahora.getTime() - 26 * 60 * 60 * 1000)

  let procesados = 0
  let huerfanos = 0
  const errores: string[] = []

  try {
    await dbConnect()

    // Buscar pagos aprobados en MP en la ventana de tiempo
    // MP devuelve hasta 50 por página; en contexto normal no habrá más de eso por hora
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/search?sort=date_approved&criteria=desc&range=date_approved&begin_date=${desde.toISOString()}&end_date=${ahora.toISOString()}&status=approved&limit=50`,
      {
        headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
      }
    )

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: `MP API error: ${err}` }, { status: 500 })
    }

    const data = await response.json() as { results: Array<{ id: number; external_reference: string; transaction_amount: number; date_approved: string }> }
    const payments = data.results ?? []
    procesados = payments.length

    for (const payment of payments) {
      const mpId = String(payment.id)
      const ref  = payment.external_reference

      if (!ref) continue  // pagos sin external_reference no son de Tallerea

      // Verificar si ya existe breakdown
      const existing = await PaymentBreakdown.findOne({ mercadoPagoId: mpId }).lean()
      if (existing) continue

      // Pago huérfano — re-ejecutar handler
      huerfanos++
      console.warn(`[RECONCILIACION] Pago huérfano detectado: mpId=${mpId} ref=${ref} monto=${payment.transaction_amount} fecha=${payment.date_approved}`)

      try {
        if (ref.startsWith('rec:')) {
          const [subId, paqueteId] = ref.slice(4).split(':')
          if (subId && paqueteId) {
            await PaymentService.handleApprovedRecarga(subId, paqueteId, mpId)
            console.log(`[RECONCILIACION] ✅ Recarga acreditada: mpId=${mpId} subId=${subId}`)
          }
        } else if (ref.startsWith('sub:')) {
          await PaymentService.handleApprovedSubscription(ref.slice(4), mpId)
          console.log(`[RECONCILIACION] ✅ Suscripción activada: mpId=${mpId}`)
        } else if (ref.startsWith('enr:')) {
          await PaymentService.handleApprovedPayment(ref.slice(4), mpId)
          console.log(`[RECONCILIACION] ✅ Enrollment procesado: mpId=${mpId}`)
        } else {
          // legacy sin prefijo
          await PaymentService.handleApprovedPayment(ref, mpId)
          console.log(`[RECONCILIACION] ✅ Enrollment legacy procesado: mpId=${mpId}`)
        }
      } catch (err: unknown) {
        const msg = `mpId=${mpId} ref=${ref}: ${err instanceof Error ? err.message : String(err)}`
        console.error(`[RECONCILIACION] ❌ Error procesando huérfano: ${msg}`)
        errores.push(msg)
      }
    }

    return NextResponse.json({
      ok: true,
      ventana: { desde: desde.toISOString(), hasta: ahora.toISOString() },
      pagosConsultados: procesados,
      huerfanosEncontrados: huerfanos,
      huerfanosRecuperados: huerfanos - errores.length,
      errores: errores.length > 0 ? errores : undefined,
      timestamp: ahora.toISOString(),
    })

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[RECONCILIACION_ERROR]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
