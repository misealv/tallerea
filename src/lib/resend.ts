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
}

export async function sendEnrollmentConfirmation(input: EnrollmentConfirmationInput) {
  if (!process.env.RESEND_API_KEY) return

  const resend = getResend()
  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'

  const horariosText = input.horarios?.length
    ? input.horarios.map(h => `${h.dia} ${h.horaInicio} - ${h.horaFin}`).join(', ')
    : ''

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
        <p>Puedes ver tus inscripciones en:</p>
        <a href="${baseUrl}/mis-talleres" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; margin-top: 8px;">
          Mis talleres
        </a>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
      </div>
    `,
  })
}
