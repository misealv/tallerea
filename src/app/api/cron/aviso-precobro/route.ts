import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Subscription from '@/models/Subscription'
import User from '@/models/User'
import Workshop from '@/models/Workshop'
import { SiteConfigService } from '@/services/SiteConfigService'
import { sendAvisoPreCobro } from '@/lib/resend'
import { ISubscription } from '@/models/Subscription'

export const dynamic = 'force-dynamic'

/**
 * [CICLO] Vercel Cron Job: se ejecuta diariamente a las 10:00 UTC.
 * Envía un aviso de cobro próximo a alumnos con mandato activo cuyo
 * fechaVencimiento cae dentro de una ventana de 24h comenzando
 * `avisoPreCobroDias` días desde ahora.
 *
 * La ventana de 24h garantiza que cada sub recibe exactamente un aviso
 * sin necesidad de guardar un flag adicional en la BD.
 *
 * Protegido con CRON_SECRET.
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

  const config = await SiteConfigService.get()
  const avisosDias = config.avisoPreCobroDias ?? 3

  const now = new Date()
  // Ventana: exactamente `avisosDias` días desde ahora ± 12h (centrada en el día del cobro)
  const ventanaInicio = new Date(now.getTime() + avisosDias * 24 * 60 * 60 * 1000)
  const ventanaFin = new Date(ventanaInicio.getTime() + 24 * 60 * 60 * 1000)

  const subs = await Subscription.find({
    pagoAutomatico: true,
    mpPreapprovalStatus: 'authorized',
    estado: 'activa',
    activo: true,
    fechaVencimiento: { $gte: ventanaInicio, $lt: ventanaFin },
  }).lean<ISubscription[]>()

  let enviados = 0
  const errores: string[] = []
  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'

  for (const sub of subs) {
    try {
      const [student, workshop] = await Promise.all([
        User.findById(sub.studentId).select('name email').lean<{ name: string; email: string }>(),
        Workshop.findById(sub.workshopId).select('titulo').lean<{ titulo: string }>(),
      ])
      if (!student?.email || !workshop) continue

      const monto = sub.precioSnapshot ?? sub.monto ?? 0
      const fechaCobro = new Date(sub.fechaVencimiento).toLocaleDateString('es-CL', {
        timeZone: 'America/Santiago',
        weekday: 'long', day: 'numeric', month: 'long',
      })

      await sendAvisoPreCobro({
        email: student.email,
        name: student.name,
        workshopTitulo: workshop.titulo,
        fechaCobro,
        monto,
        panelUrl: `${baseUrl}/alumno/suscripciones`,
      })
      enviados++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errores.push(`sub=${String(sub._id)}: ${msg}`)
    }
  }

  return NextResponse.json({
    ok: true,
    enviados,
    errores: errores.length,
    timestamp: new Date().toISOString(),
  })
}
