/**
 * _notify_diego_recarga_activa.mjs
 * Envía email de confirmación a Diego informando que sus 48 sesiones están activas.
 */
import 'dotenv/config'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = process.env.FROM_EMAIL || 'Tallerea <noreply@tallerea.cl>'

await resend.emails.send({
  from: FROM,
  to:   'diegoanguloq@gmail.com',
  subject: '¡Tu paquete de 48 sesiones ya está activo! — Programa de iniciación musical al Piano',
  html: `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #7c3aed;">¡Tu paquete ya está activo!</h2>
      <p>Hola <strong>Diego</strong>,</p>
      <p>Confirmamos que tu pago fue recibido y tus clases ya están disponibles en tu cuenta:</p>
      <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Taller:</strong> Programa de iniciación musical al Piano</p>
        <p style="margin: 4px 0;"><strong>Paquete:</strong> Plan de 48 sesiones</p>
        <p style="margin: 4px 0;"><strong>Monto pagado:</strong> $580.000</p>
        <p style="margin: 4px 0;"><strong>Sesiones disponibles:</strong> 48</p>
        <p style="margin: 4px 0;"><strong>Válido hasta:</strong> 4 de septiembre de 2028</p>
      </div>
      <p>Ya puedes ingresar a tu cuenta y reservar tus clases:</p>
      <a href="https://tallerea.cl/alumno" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; margin-top: 8px; font-size: 16px;">
        Reservar mis clases
      </a>
      <p style="color: #6b7280; font-size: 13px; margin-top: 20px;">
        Si tienes alguna duda, responde este correo y te ayudamos.
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
    </div>
  `,
})

console.log('✅ Email enviado a diegoanguloq@gmail.com')
