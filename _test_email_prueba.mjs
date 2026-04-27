// Script temporal: enviar email de prueba de clase de prueba a miseal@gmail.com
// Uso: node _test_email_prueba.mjs

import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '.env.local') })

const { Resend } = await import('resend')
const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.FROM_EMAIL || 'Tallerea <noreply@tallerea.cl>'
const BASE_URL = process.env.NEXTAUTH_URL || 'https://tallerea.cl'

const studentName  = 'Aurora Sepúlveda'
const studentEmail = 'miseal@gmail.com'
const workshopTitle = 'Taller de Cerámica para Principiantes'
const workshopSlug  = 'taller-ceramica-principiantes'
const monto         = 9990
const slotFecha     = 'sábado 3 de mayo de 2026'
const slotHora      = '10:00 - 11:30'
const profesorNombre = 'Valentina Rojas'
const direccion     = 'Estudio Arte Vivo, Av. Italia 1234, Providencia'
// Simular link de activación de cuenta
const magicUrl = `${BASE_URL}/completar-registro?token=EJEMPLO_TOKEN_TEST`

// ─── Email al alumno ──────────────────────────────────────────────────────
const accessBlock = `
  <p>Te creamos una cuenta. Ingresa con este enlace seguro (válido <strong>15 minutos</strong>, un solo uso):</p>
  <a href="${magicUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; margin-top: 8px; font-size: 16px;">
    Activar mi cuenta y revisar mi clase
  </a>
  <p style="color: #6b7280; font-size: 13px; margin-top: 12px;">Si el enlace expira, puedes solicitar otro desde la página de inicio de sesión.</p>
`

await resend.emails.send({
  from: FROM_EMAIL,
  to: studentEmail,
  subject: `[TEST] Inscripción confirmada: ${workshopTitle}`,
  html: `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #7c3aed;">¡Inscripción confirmada!</h2>
      <p>Hola <strong>${studentName}</strong>,</p>
      <p>Tu inscripción ha sido confirmada:</p>
      <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Taller:</strong> ${workshopTitle}</p>
        <p style="margin: 4px 0;"><strong>Monto:</strong> $${monto.toLocaleString('es-CL')}</p>
        <p style="margin: 4px 0;"><strong>Fecha:</strong> ${slotFecha}</p>
        <p style="margin: 4px 0;"><strong>Horario:</strong> ${slotHora}</p>
        <p style="margin: 4px 0;"><strong>Profesor/a:</strong> ${profesorNombre}</p>
        <p style="margin: 4px 0;"><strong>Dirección:</strong> ${direccion}</p>
      </div>
      ${accessBlock}
      <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
    </div>
  `,
})

console.log('✅ Email alumno enviado a', studentEmail)

// ─── Email al profesor ────────────────────────────────────────────────────
await resend.emails.send({
  from: FROM_EMAIL,
  to: studentEmail,  // enviamos al mismo destino de prueba
  subject: `[TEST] Nueva clase de prueba reservada: ${workshopTitle}`,
  html: `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #7c3aed;">¡Nueva clase de prueba reservada!</h2>
      <p>Hola <strong>${profesorNombre}</strong>,</p>
      <p>Un alumno reservó una clase de prueba en <strong>${workshopTitle}</strong>.</p>
      <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Alumno:</strong> ${studentName}</p>
        <p style="margin: 4px 0;"><strong>Email:</strong> aurora.sepulveda@ejemplo.cl</p>
        <p style="margin: 4px 0;"><strong>Fecha:</strong> ${slotFecha}</p>
        <p style="margin: 4px 0;"><strong>Horario:</strong> ${slotHora}</p>
      </div>
      <a href="${BASE_URL}/tallerista" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; margin-top: 8px;">
        Ver en mi panel
      </a>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
    </div>
  `,
})

console.log('✅ Email profesor enviado a', studentEmail)
