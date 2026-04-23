import { Resend } from 'resend'

let _resend: Resend | null = null

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

const FROM_EMAIL = process.env.FROM_EMAIL || 'Tallerea <noreply@tallerea.cl>'

interface EnrollmentConfirmationInput {
  studentName: string
  studentEmail: string
  workshopTitle: string
  workshopSlug: string
  monto: number
  fechaInicio?: string
  horarios?: { dia: string; horaInicio: string; horaFin: string }[]
  // Si presente, el alumno es invitado: incluir CTA con magic link para activar cuenta
  magicUrl?: string
}

export async function sendEnrollmentConfirmation(input: EnrollmentConfirmationInput) {
  if (!process.env.RESEND_API_KEY) return

  const resend = getResend()
  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'

  const horariosText = input.horarios?.length
    ? input.horarios.map(h => `${h.dia} ${h.horaInicio} - ${h.horaFin}`).join(', ')
    : ''

  // Bloque CTA: magic link tiene prioridad si existe (alumno recién creado)
  const accessBlock = input.magicUrl
    ? `
        <p>Te creamos una cuenta. Ingresa con este enlace seguro (válido <strong>15 minutos</strong>, un solo uso):</p>
        <a href="${input.magicUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; margin-top: 8px; font-size: 16px;">
          Activar mi cuenta
        </a>
        <p style="color: #6b7280; font-size: 13px; margin-top: 12px;">Si el enlace expira, puedes solicitar otro desde la página de inicio de sesión.</p>
      `
    : `
        <p>Puedes ver tus inscripciones en:</p>
        <a href="${baseUrl}/alumno" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; margin-top: 8px;">
          Mis talleres
        </a>
      `

  await resend.emails.send({
    from: FROM_EMAIL,
    to: input.studentEmail,
    subject: `Inscripción confirmada: ${input.workshopTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">¡Inscripción confirmada!</h2>
        <p>Hola <strong>${input.studentName}</strong>,</p>
        <p>Tu inscripción ha sido confirmada:</p>
        <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Taller:</strong> ${input.workshopTitle}</p>
          <p style="margin: 4px 0;"><strong>Monto:</strong> $${input.monto.toLocaleString('es-CL')}</p>
          ${input.fechaInicio ? `<p style="margin: 4px 0;"><strong>Inicio:</strong> ${input.fechaInicio}</p>` : ''}
          ${horariosText ? `<p style="margin: 4px 0;"><strong>Horarios:</strong> ${horariosText}</p>` : ''}
        </div>
        ${accessBlock}
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
      </div>
    `,
  })
}

export async function sendMagicLink({ email, magicUrl }: { email: string; magicUrl: string }) {
  if (!process.env.RESEND_API_KEY) {
    // En dev sin Resend configurado, solo loguear
    console.log('[magic-link]', magicUrl)
    return
  }
  const resend = getResend()
  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Tu enlace de acceso a Tallerea',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Accede a tus talleres</h2>
        <p>Haz clic en el siguiente enlace para ingresar a tu cuenta. El enlace es válido por <strong>15 minutos</strong> y solo puede usarse una vez.</p>
        <a href="${magicUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; margin: 16px 0; font-size: 16px;">
          Ingresar a Tallerea
        </a>
        <p style="color: #6b7280; font-size: 14px;">Si no solicitaste este enlace, puedes ignorar este correo.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
      </div>
    `,
  })
}

// ─── Emails para flujo tallerista ────────────────────────────────────────────

export async function sendTallerSolicitudAdmin({
  userId,
  userName,
  userEmail,
  bio,
}: {
  userId: string
  userName: string
  userEmail: string
  bio: string
}) {
  if (!process.env.RESEND_API_KEY || !process.env.ADMIN_EMAIL) return

  const resend = getResend()
  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'

  await resend.emails.send({
    from: FROM_EMAIL,
    to: process.env.ADMIN_EMAIL,
    subject: `Nueva solicitud de tallerista: ${userName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Nueva solicitud de tallerista</h2>
        <p><strong>${userName}</strong> (${userEmail}) ha solicitado unirse como tallerista.</p>
        <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Bio:</strong> ${bio.slice(0, 300)}${bio.length > 300 ? '…' : ''}</p>
        </div>
        <a href="${baseUrl}/admin/talleristas/${userId}" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; margin-top: 8px;">
          Revisar solicitud
        </a>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
      </div>
    `,
  })
}

export async function sendTallerAprobado({ email, name }: { email: string; name: string }) {
  if (!process.env.RESEND_API_KEY) return

  const resend = getResend()
  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: '¡Tu solicitud fue aprobada! Bienvenido/a a Tallerea',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">¡Solicitud aprobada! 🎉</h2>
        <p>Hola <strong>${name}</strong>,</p>
        <p>Tu solicitud para ser tallerista en Tallerea fue <strong>aprobada</strong>. Ya puedes publicar tus talleres y empezar a recibir alumnos.</p>
        <a href="${baseUrl}/tallerista/dashboard" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
          Ir a mi panel
        </a>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
      </div>
    `,
  })
}

export async function sendTallerRechazado({
  email,
  name,
  razon,
}: {
  email: string
  name: string
  razon: string
}) {
  if (!process.env.RESEND_API_KEY) return

  const resend = getResend()

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Actualización sobre tu solicitud en Tallerea',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Actualización de tu solicitud</h2>
        <p>Hola <strong>${name}</strong>,</p>
        <p>Hemos revisado tu solicitud y en esta ocasión no pudimos aprobarla.</p>
        <div style="background: #fef2f2; border-left: 4px solid #ef4444; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0; color: #7f1d1d;"><strong>Razón:</strong> ${razon}</p>
        </div>
        <p>Puedes volver a postular después de 30 días. Si tienes preguntas, responde este correo.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
      </div>
    `,
  })
}
