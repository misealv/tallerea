import { NextRequest, NextResponse } from 'next/server'
import { SubscriptionService } from '@/services/SubscriptionService'

// Fuerza render dinámico — el cron lee headers y escribe en DB, no debe cachearse
export const dynamic = 'force-dynamic'

/**
 * [CICLO] Vercel Cron Job: se ejecuta diariamente a las 03:00 UTC.
 * Procesa suscripciones activas cuyo fechaVencimiento < now:
 *   - Cancela bookings futuras (razon: 'ciclo_vencido')
 *   - Marca suscripción como 'vencida'
 *   - Envía email al alumno según su preferencia autoRenovar
 *
 * Protegido con CRON_SECRET. Fail-closed: sin secret configurado, rechaza.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  // Fail-closed: si no hay secret configurado, no permitir ejecución.
  // En prod, setear CRON_SECRET en Vercel env vars (Vercel lo envía automáticamente).
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET no configurado' },
      { status: 500 }
    )
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
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
