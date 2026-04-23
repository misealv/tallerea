import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import dbConnect from '@/lib/db'
import Workshop from '@/models/Workshop'
import { SlotGeneratorService } from '@/services/SlotGeneratorService'

export const dynamic = 'force-dynamic'

// GET /api/cron/extend-slots — Extiende slots de talleres recurrentes con ventana < 4 semanas
// Protegido por CRON_SECRET (Bearer token desde Vercel Cron)
export async function GET() {
  const authHeader = (await headers()).get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // Fail-closed: si no hay CRON_SECRET configurado, rechazar
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await dbConnect()

    const now = new Date()
    const horizon = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000) // 4 semanas

    // Buscar talleres recurrentes activos con plantilla definida
    interface WorkshopForCron {
      _id: unknown
      slots: { fecha?: Date }[]
      tipoRecurrencia?: string
      plantillaSemanal?: unknown[]
      recurrencia?: { cantidadRepeticiones?: number }
      fechaInicio?: Date
    }
    const workshops = await Workshop.find({
      activo: true,
      modeloAcceso: 'recurrente',
      tipoRecurrencia: { $in: ['semanal', 'mensual'] },
      $or: [{ plantillaSemanal: { $exists: true, $not: { $size: 0 } } }, { plantillaMensual: { $exists: true } }],
    }).select('_id slots tipoRecurrencia plantillaSemanal plantillaMensual recurrencia fechaInicio').lean<WorkshopForCron[]>()

    let extended = 0

    // [PERF] Procesar talleres en paralelo con Promise.allSettled
    const tasks = workshops.map(async (w) => {
      const slots = w.slots
      const futureSlots = slots.filter(s => s.fecha && new Date(s.fecha) > now)
      const lastFutureDate = futureSlots.length > 0
        ? new Date(Math.max(...futureSlots.map(s => new Date(s.fecha!).getTime())))
        : now

      if (lastFutureDate >= horizon) return false

      // [CICLO] Calcular repeticiones desde fechaInicio para cubrir hasta horizon
      if (w.tipoRecurrencia === 'semanal' && w.fechaInicio) {
        const semanasNecesarias = Math.ceil(
          (horizon.getTime() - new Date(w.fechaInicio).getTime()) / (7 * 24 * 60 * 60 * 1000)
        ) + 4
        const actual = w.recurrencia?.cantidadRepeticiones ?? 4
        const target = Math.max(actual, semanasNecesarias)
        if (target > actual) {
          await Workshop.updateOne(
            { _id: w._id },
            { $set: { 'recurrencia.cantidadRepeticiones': target } }
          )
        }
      }
      await SlotGeneratorService.applyGeneratedSlots(String(w._id))
      return true
    })

    const results = await Promise.allSettled(tasks)
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) extended++
      else if (r.status === 'rejected') console.warn('[extend-slots] Fallo:', r.reason)
    }

    return NextResponse.json({ ok: true, extended, checked: workshops.length })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
