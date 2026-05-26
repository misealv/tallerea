import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Enrollment from '@/models/Enrollment'
import Subscription from '@/models/Subscription'
import Booking from '@/models/Booking'
import Review from '@/models/Review'
import { sendReviewInvitation } from '@/lib/resend'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

type UserLean = { _id: Types.ObjectId; name: string; email: string }
type WorkshopLean = { _id: Types.ObjectId; titulo: string; slug: string; slots: Array<{ fecha?: Date }> }

export async function GET(req: NextRequest) {
  // Proteger el cron con el secret de Vercel
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await dbConnect()
  const now = new Date()
  const BATCH_LIMIT = 50
  let enviados = 0
  let errores = 0

  // ── Canal 1: Enrollments puntuales con slot pasado, aún sin email ──────────
  const enrollmentsPendientes = await Enrollment.find({
    estado: 'pagado',
    activo: true,
    esClasePrueba: { $ne: true },
    reviewEmailEnviadoEn: { $exists: false },
  })
    .limit(BATCH_LIMIT)
    .populate('workshopId', 'titulo slug slots')
    .populate('studentId', 'name email')
    .lean<Array<{
      _id: Types.ObjectId
      workshopId: WorkshopLean | null
      studentId: UserLean | null
      slotIndex: number | null
    }>>()

  for (const e of enrollmentsPendientes) {
    const w = e.workshopId
    const student = e.studentId
    if (!w || !student?.email) continue

    const idx = e.slotIndex ?? 0
    const slotFecha = w.slots?.[idx]?.fecha
    // Solo enviar si el slot ya pasó (clase realizada)
    if (!slotFecha || new Date(slotFecha) >= now) continue

    // No enviar si el alumno ya dejó reseña para este taller
    const yaReseñado = await Review.exists({
      workshopId: w._id,
      studentId:  student._id,
      activo:     true,
    })
    if (yaReseñado) {
      // Marcar como enviado para no volver a evaluarlo en próximos runs
      await Enrollment.updateOne({ _id: e._id }, { $set: { reviewEmailEnviadoEn: now } })
      continue
    }

    try {
      await sendReviewInvitation({
        email:         student.email,
        name:          student.name ?? 'alumno',
        workshopTitle: w.titulo,
        workshopSlug:  w.slug,
      })
      await Enrollment.updateOne(
        { _id: e._id },
        { $set: { reviewEmailEnviadoEn: now } }
      )
      enviados++
    } catch {
      errores++
    }
  }

  // ── Canal 2: Subscriptions ≥7 días con booking asistido, aún sin email ─────
  const hace7dias = new Date(now)
  hace7dias.setDate(hace7dias.getDate() - 7)

  const subscriptionsPendientes = await Subscription.find({
    activo: true,
    estado: { $in: ['activa', 'vencida'] },
    reviewEmailEnviadoEn: { $exists: false },
    createdAt: { $lte: hace7dias },
  })
    .limit(BATCH_LIMIT)
    .populate('workshopId', '_id titulo slug')
    .populate('studentId', 'name email')
    .lean<Array<{
      _id: Types.ObjectId
      workshopId: { _id: Types.ObjectId; titulo: string; slug: string } | null
      studentId: UserLean | null
    }>>()

  for (const s of subscriptionsPendientes) {
    const w = s.workshopId
    const student = s.studentId
    if (!w || !student?.email) continue

    // Verificar que tiene al menos 1 booking asistido
    const tieneAsistencia = await Booking.exists({
      subscriptionId: s._id,
      estado: 'asistio',
      activo: true,
    })
    if (!tieneAsistencia) continue

    // No enviar si el alumno ya dejó reseña para este taller
    const yaReseñado = await Review.exists({
      workshopId: w._id,
      studentId:  student._id,
      activo:     true,
    })
    if (yaReseñado) {
      await Subscription.updateOne({ _id: s._id }, { $set: { reviewEmailEnviadoEn: now } })
      continue
    }

    try {
      await sendReviewInvitation({
        email:         student.email,
        name:          student.name ?? 'alumno',
        workshopTitle: w.titulo,
        workshopSlug:  w.slug,
      })
      await Subscription.updateOne(
        { _id: s._id },
        { $set: { reviewEmailEnviadoEn: now } }
      )
      enviados++
    } catch {
      errores++
    }
  }

  return NextResponse.json({ ok: true, enviados, errores })
}
