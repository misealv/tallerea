import { NextRequest, NextResponse } from 'next/server'
import { SubscriptionService } from '@/services/SubscriptionService'

/**
 * [CICLO] Vercel Cron Job: se ejecuta diariamente a las 03:00 UTC.
 * Procesa suscripciones activas cuyo fechaVencimiento < now:
 *   - Cancela bookings futuras (razon: 'ciclo_vencido')
 *   - Marca suscripción como 'vencida'
 *   - Envía email al alumno según su preferencia autoRenovar
 *
 * Protegido con CRON_SECRET para evitar invocación no autorizada.
 */
export async function GET(req: NextRequest) {
  // Verificar secret del cron
  const secret = process.env.CRON_SECRET
  if (secret) {
    const authHeader = req.headers.get('authorization')
    // Vercel envía el secret como "Bearer <CRON_SECRET>"
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  }

  try {
    const resultado = await SubscriptionService.vencerLote()

    return NextResponse.json({
      ok: true,
      procesadas: resultado.procesadas,
      errores: resultado.errores,
      timestamp: new Date().toISOString(),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    console.error('[cron/vencer-suscripciones]', message)
    // Retornar 200 para que Vercel no marque el job como fallido por un error transitorio
    // — los errores individuales ya se cuentan dentro de vencerLote()
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
