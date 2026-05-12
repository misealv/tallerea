/**
 * Script de ejecución única: envía recordatorio de reserva a todos los alumnos
 * con suscripción activa que NO han reservado clase esta semana.
 * CC a miseal@gmail.com en cada correo.
 *
 * Uso: node _send_recordatorio_reservas.mjs [--dry-run]
 */
import mongoose from 'mongoose'
import { Resend } from 'resend'
import { randomBytes, createHash } from 'crypto'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const DRY_RUN = process.argv.includes('--dry-run')
const CC_EMAIL = 'miseal@gmail.com'
const FROM_EMAIL = 'Tallerea <noreply@tallerea.cl>'
const BASE_URL = 'https://tallerea.cl'

await mongoose.connect(process.env.MONGODB_URI)
const resend = new Resend(process.env.RESEND_API_KEY)
const db = mongoose.connection.db

// Calcular rango lunes-domingo de la semana actual (UTC)
const now = new Date()
const dayOfWeek = now.getUTCDay()
const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
const monday = new Date(now)
monday.setUTCDate(now.getUTCDate() + diffToMonday)
monday.setUTCHours(0, 0, 0, 0)
const sunday = new Date(monday)
sunday.setUTCDate(monday.getUTCDate() + 7)
sunday.setUTCHours(23, 59, 59, 999)

console.log(`Semana: ${monday.toISOString()} → ${sunday.toISOString()}`)
console.log(DRY_RUN ? '--- MODO DRY-RUN ---' : '--- MODO REAL ---')

// Suscripciones activas con sesiones disponibles en talleres recurrentes
const subs = await db.collection('subscriptions').aggregate([
  { $match: { estado: 'activa', sesionesDisponibles: { $gt: 0 }, activo: true } },
  { $lookup: { from: 'workshops', localField: 'workshopId', foreignField: '_id', as: 'workshop' } },
  { $unwind: '$workshop' },
  { $match: { 'workshop.modeloAcceso': 'recurrente' } },
  { $lookup: { from: 'users', localField: 'studentId', foreignField: '_id', as: 'student' } },
  { $unwind: '$student' },
  { $lookup: { from: 'users', localField: 'workshop.ownerId', foreignField: '_id', as: 'owner' } },
  { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
]).toArray()

console.log(`Suscripciones candidatas: ${subs.length}`)

let enviados = 0
let omitidos = 0
let errores = 0

for (const sub of subs) {
  // Verificar si ya reservó esta semana
  const yaReservo = await db.collection('bookings').findOne({
    subscriptionId: sub._id,
    estado: 'reservada',
    fecha: { $gte: monday, $lte: sunday },
    ...(sub.dependentId ? { dependentId: sub.dependentId } : {}),
  })

  if (yaReservo) {
    omitidos++
    continue
  }

  // Slots disponibles esta semana
  const slotsEstaSemana = (sub.workshop.slots || [])
    .filter(s =>
      s.fecha &&
      new Date(s.fecha) >= monday &&
      new Date(s.fecha) <= sunday &&
      !s.cancelado &&
      s.reservas < sub.workshop.cupoPorSesion
    )

  if (slotsEstaSemana.length === 0) {
    omitidos++
    console.log(`  OMITIDO (sin slots): ${sub.student.name} — ${sub.workshop.titulo}`)
    continue
  }

  const profesorNombre = sub.owner?.name ?? 'tu tallerista'
  const destino = sub.dependentNombreSnapshot ? ` para ${sub.dependentNombreSnapshot}` : ''

  // Magic link para alumnos sin password; login+redirect para los que sí tienen
  let ctaUrl = `${BASE_URL}/login?callbackUrl=/alumno/mis-clases`
  if (!sub.student.password) {
    try {
      const rawToken = randomBytes(32).toString('hex')
      const tokenHash = createHash('sha256').update(rawToken).digest('hex')
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)
      await db.collection('users').updateOne(
        { _id: sub.student._id },
        { $set: { magicLinkToken: tokenHash, magicLinkExpiresAt: expiresAt } }
      )
      ctaUrl = `${BASE_URL}/completar-registro?token=${rawToken}`
    } catch (err) {
      console.error(`  WARN magic link fallido para ${sub.student.email}:`, err.message)
    }
  }

  const slotsHtml = slotsEstaSemana.map(s => {
    const fechaTexto = new Intl.DateTimeFormat('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long',
      timeZone: 'America/Santiago',
    }).format(new Date(s.fecha))
    const cupoDisponible = sub.workshop.cupoPorSesion - s.reservas
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e9d5ff;">${fechaTexto}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e9d5ff;">${s.horaInicio} - ${s.horaFin}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e9d5ff;color:#7c3aed;">${cupoDisponible} lugar${cupoDisponible !== 1 ? 'es' : ''}</td>
    </tr>`
  }).join('')

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#7c3aed;">¡Agenda tu clase de esta semana!</h2>
      <p>Hola ${sub.student.name},</p>
      <p>Tienes sesiones disponibles en <strong>${sub.workshop.titulo}</strong> con <strong>${profesorNombre}</strong>${destino}.</p>
      <p style="color:#6b7280;font-size:14px;">Elige tu horario antes de que se llenen — las clases se reservan por orden de llegada.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f5f3ff;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#7c3aed;color:white;">
            <th style="padding:10px 12px;text-align:left;font-size:13px;">Fecha</th>
            <th style="padding:10px 12px;text-align:left;font-size:13px;">Horario</th>
            <th style="padding:10px 12px;text-align:left;font-size:13px;">Cupo</th>
          </tr>
        </thead>
        <tbody>${slotsHtml}</tbody>
      </table>
      <table border="0" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#7c3aed;">
        <a href="${ctaUrl}" target="_blank" style="display:inline-block;background:#7c3aed;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:16px;font-family:sans-serif;">Reservar mi clase</a>
      </td></tr></table>
      <p style="color:#9ca3af;font-size:12px;margin-top:32px;">
        Si no puedes esta semana, tu sesión queda disponible para el próximo período.<br>
        — Tallerea.cl
      </p>
    </div>`

  console.log(`  ${DRY_RUN ? '[DRY]' : 'ENVIANDO'}: ${sub.student.email} — ${sub.workshop.titulo}${destino} (${slotsEstaSemana.length} slots)`)

  if (!DRY_RUN) {
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: sub.student.email,
        cc: [CC_EMAIL],
        subject: `Reserva tu clase esta semana${destino} — ${sub.workshop.titulo}`,
        html,
      })
      enviados++
    } catch (err) {
      errores++
      console.error(`  ERROR: ${sub.student.email}`, err.message)
    }
  } else {
    enviados++
  }
}

await mongoose.disconnect()

console.log(`\nResultado: ${enviados} enviados | ${omitidos} omitidos (ya reservaron o sin slots) | ${errores} errores`)
