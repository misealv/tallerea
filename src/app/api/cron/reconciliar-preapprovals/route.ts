import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Subscription from '@/models/Subscription'
import { getPreapproval } from '@/lib/mercadopago'

export const dynamic = 'force-dynamic'

// Divergencia tolerable en días entre fechaVencimiento local y next_payment_date de MP.
// Por encima de este umbral se registra como divergencia.
const UMBRAL_DIAS = 2

/**
 * [CICLO] Vercel Cron Job: se ejecuta diariamente a las 03:45 UTC.
 * Compara fechaVencimiento local (DB) contra el próximo cobro que MP tiene
 * programado (next_payment_date del preapproval) para todas las subs con
 * mandato activo. Registra divergencias con console.warn — NO auto-corrige.
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

  await dbConnect()

  // Candidatas: mandato activo y suscripción vigente
  const subs = await Subscription.find({
    pagoAutomatico: true,
    mpPreapprovalStatus: 'authorized',
    estado: 'activa',
    activo: true,
    mpPreapprovalId: { $exists: true, $ne: null },
  })
    .select('_id mpPreapprovalId fechaVencimiento studentId workshopId')
    .lean()

  let revisadas = 0
  let divergencias = 0
  const errores: string[] = []

  for (const sub of subs) {
    revisadas++
    try {
      const preapproval = await getPreapproval(sub.mpPreapprovalId as string)

      if (!preapproval.next_payment_date) continue

      const mpFecha = new Date(preapproval.next_payment_date)
      const localFecha = new Date(sub.fechaVencimiento as Date)

      const diffMs = Math.abs(mpFecha.getTime() - localFecha.getTime())
      const diffDias = diffMs / (1000 * 60 * 60 * 24)

      if (diffDias > UMBRAL_DIAS) {
        divergencias++
        // [CICLO] Loguear sin auto-corregir. Requiere revisión manual.
        console.warn(
          `[reconciliar-preapprovals] DIVERGENCIA sub=${String(sub._id)}` +
          ` mpPreapprovalId=${sub.mpPreapprovalId}` +
          ` localFechaVencimiento=${localFecha.toISOString()}` +
          ` mpNextPaymentDate=${mpFecha.toISOString()}` +
          ` diffDias=${diffDias.toFixed(1)}`
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errores.push(`sub=${String(sub._id)}: ${msg}`)
    }
  }

  return NextResponse.json({
    ok: true,
    revisadas,
    divergencias,
    errores: errores.length,
    timestamp: new Date().toISOString(),
  })
}
