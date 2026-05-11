import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Subscription from '@/models/Subscription'
import Booking from '@/models/Booking'
import Workshop from '@/models/Workshop'
import User from '@/models/User'
import { Types } from 'mongoose'
import { sendRecordatorioReservar } from '@/lib/resend'

export const dynamic = 'force-dynamic'

type WorkshopPopulated = {
  _id: Types.ObjectId
  titulo: string
  slots: Array<{ fecha?: Date; horaInicio: string; horaFin: string; cancelado: boolean; reservas: number }>
  cupoPorSesion: number
  modeloAcceso: string
  ownerId: Types.ObjectId
}

type StudentPopulated = {
  _id: Types.ObjectId
  name: string
  email: string
  password?: string
}

type SubLean = {
  _id: Types.ObjectId
  workshopId: WorkshopPopulated
  studentId: StudentPopulated
  sesionesDisponibles: number
  dependentId?: Types.ObjectId
  dependentNombreSnapshot?: string
}

/**
 * [CICLO] Vercel Cron Job: se ejecuta los lunes a las 13:00 UTC (9am Chile aprox).
 * Envía recordatorio de reserva a alumnos con suscripción activa que NO han
 * reservado ninguna clase para la semana en curso (lunes-domingo Chile).
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

  // Calcular rango lunes-domingo de la semana actual en UTC
  // (los slots tienen fecha en UTC; lunes 00:00 UTC cubre el día Chile)
  const now = new Date()
  const dayOfWeek = now.getUTCDay() // 0=dom, 1=lun, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() + diffToMonday)
  monday.setUTCHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 7)
  sunday.setUTCHours(23, 59, 59, 999)

  // Suscripciones activas con sesiones disponibles
  const suscripciones = await Subscription.find({
    estado: 'activa',
    sesionesDisponibles: { $gt: 0 },
    activo: true,
  })
    .populate('workshopId', 'titulo slots cupoPorSesion modeloAcceso ownerId')
    .populate('studentId', 'name email password')
    .lean() as unknown as SubLean[]

  let enviados = 0
  let errores = 0

  for (const sub of suscripciones) {
    try {
      const workshop = sub.workshopId
      const student = sub.studentId

      // Solo talleres recurrentes
      if (workshop.modeloAcceso !== 'recurrente') continue

      // Slots disponibles esta semana (con fecha definida, no cancelados, con cupo)
      const slotsEstaSemana = (workshop.slots ?? [])
        .map((slot, idx) => ({ ...slot, idx }))
        .filter(s =>
          s.fecha &&
          new Date(s.fecha) >= monday &&
          new Date(s.fecha) <= sunday &&
          !s.cancelado &&
          s.reservas < workshop.cupoPorSesion
        )

      if (slotsEstaSemana.length === 0) continue

      // Verificar si ya tiene alguna reserva activa esta semana
      const yaReservó = await Booking.exists({
        subscriptionId: sub._id,
        estado: 'reservada',
        fecha: { $gte: monday, $lte: sunday },
        ...(sub.dependentId ? { dependentId: sub.dependentId } : {}),
      })

      if (yaReservó) continue

      // Obtener nombre del tallerista
      const owner = await User.findById(workshop.ownerId).select('name').lean<{ name: string }>()
      const profesorNombre = owner?.name ?? 'tu tallerista'

      // Formatear slots para el email
      const slotsDisponibles = slotsEstaSemana.map(s => ({
        fechaTexto: new Intl.DateTimeFormat('es-CL', {
          weekday: 'long', day: 'numeric', month: 'long',
          timeZone: 'America/Santiago',
        }).format(new Date(s.fecha!)),
        horaTexto: `${s.horaInicio} - ${s.horaFin}`,
        cupoDisponible: workshop.cupoPorSesion - s.reservas,
      }))

      // Magic link para alumnos guest (sin password)
      let magicUrl: string | undefined
      if (!student.password) {
        try {
          const { issueMagicLink } = await import('@/lib/issueMagicLink')
          const result = await issueMagicLink(String(student._id))
          magicUrl = result.magicUrl
        } catch {
          // No bloquear el envío por fallo del magic link
        }
      }

      await sendRecordatorioReservar({
        studentEmail: student.email,
        studentName: student.name,
        workshopTitle: workshop.titulo,
        profesorNombre,
        slotsDisponibles,
        magicUrl,
        dependentNombre: sub.dependentNombreSnapshot,
      })

      enviados++
    } catch (err) {
      errores++
      console.error('[cron/recordatorio-reservas] error en sub', String(sub._id), err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json({
    ok: true,
    enviados,
    errores,
    semana: { desde: monday.toISOString(), hasta: sunday.toISOString() },
    timestamp: new Date().toISOString(),
  })
}
