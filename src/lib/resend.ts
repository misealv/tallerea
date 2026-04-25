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
  // Detalles del slot reservado (clase de prueba o sesión puntual)
  slotFecha?: string    // ej: "sábado 3 de mayo"
  slotHora?: string     // ej: "10:00 - 11:30"
  direccion?: string    // nombre del lugar + dirección
  profesorNombre?: string
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
          ${input.slotFecha ? `<p style="margin: 4px 0;"><strong>Fecha:</strong> ${input.slotFecha}</p>` : ''}
          ${input.slotHora ? `<p style="margin: 4px 0;"><strong>Horario:</strong> ${input.slotHora}</p>` : ''}
          ${input.profesorNombre ? `<p style="margin: 4px 0;"><strong>Profesor/a:</strong> ${input.profesorNombre}</p>` : ''}
          ${input.direccion ? `<p style="margin: 4px 0;"><strong>Dirección:</strong> ${input.direccion}</p>` : ''}
        </div>
        ${accessBlock}
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
      </div>
    `,
  })
}

// Notificación al profesor cuando un alumno reserva su clase de prueba
export async function sendClasePruebaProfesor({
  profesorEmail,
  profesorNombre,
  studentName,
  studentEmail,
  workshopTitle,
  slotFecha,
  slotHora,
  dashboardUrl,
}: {
  profesorEmail: string
  profesorNombre: string
  studentName: string
  studentEmail: string
  workshopTitle: string
  slotFecha?: string
  slotHora?: string
  dashboardUrl: string
}) {
  if (!process.env.RESEND_API_KEY) return

  const resend = getResend()

  await resend.emails.send({
    from: FROM_EMAIL,
    to: profesorEmail,
    subject: `Nueva clase de prueba reservada: ${workshopTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">¡Nueva clase de prueba reservada!</h2>
        <p>Hola <strong>${profesorNombre}</strong>,</p>
        <p>Un alumno reservó una clase de prueba en <strong>${workshopTitle}</strong>.</p>
        <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Alumno:</strong> ${studentName}</p>
          <p style="margin: 4px 0;"><strong>Email:</strong> ${studentEmail}</p>
          ${slotFecha ? `<p style="margin: 4px 0;"><strong>Fecha:</strong> ${slotFecha}</p>` : ''}
          ${slotHora ? `<p style="margin: 4px 0;"><strong>Horario:</strong> ${slotHora}</p>` : ''}
        </div>
        <a href="${dashboardUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; margin-top: 8px;">
          Ver en mi panel
        </a>
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
        <a href="${baseUrl}/tallerista" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
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

export async function sendTallerSolicitudRecibida({
  email,
  name,
  esRepostulacion,
}: {
  email: string
  name: string
  esRepostulacion: boolean
}) {
  if (!process.env.RESEND_API_KEY) return

  const resend = getResend()

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: esRepostulacion
      ? 'Recibimos tu nueva postulación en Tallerea'
      : 'Recibimos tu solicitud en Tallerea',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">¡Gracias ${name}!</h2>
        <p>Hemos recibido tu ${esRepostulacion ? 'nueva postulación' : 'solicitud'} para ser tallerista en Tallerea.</p>
        <p>Nuestro equipo la revisará en los próximos días hábiles y te escribiremos por este mismo medio cuando tengamos una respuesta.</p>
        <p style="color: #6b7280; font-size: 14px;">No necesitas hacer nada más por ahora.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
      </div>
    `,
  })
}

export async function sendTallerSuspendido({
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
    subject: 'Tu cuenta de tallerista ha sido suspendida temporalmente',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Cuenta suspendida</h2>
        <p>Hola <strong>${name}</strong>,</p>
        <p>Tu cuenta de tallerista ha sido suspendida temporalmente. Durante la suspensión no podrás publicar talleres ni recibir nuevas inscripciones.</p>
        <div style="background: #fef2f2; border-left: 4px solid #ef4444; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0; color: #7f1d1d;"><strong>Motivo:</strong> ${razon}</p>
        </div>
        <p>Si crees que es un error, responde este correo para conversarlo.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
      </div>
    `,
  })
}

export async function sendTallerReactivado({
  email,
  name,
}: {
  email: string
  name: string
}) {
  if (!process.env.RESEND_API_KEY) return

  const resend = getResend()
  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Tu cuenta de tallerista fue reactivada',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">¡Bienvenido/a de vuelta!</h2>
        <p>Hola <strong>${name}</strong>,</p>
        <p>Tu cuenta de tallerista ha sido reactivada. Ya puedes volver a publicar talleres y recibir alumnos.</p>
        <a href="${baseUrl}/tallerista" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
          Ir a mi panel
        </a>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
      </div>
    `,
  })
}

// ─── Emails para ciclo de suscripciones ──────────────────────────────────────

export async function sendSubscriptionVencida({
  email,
  name,
  workshopTitulo,
  workshopSlug,
}: {
  email: string
  name: string
  workshopTitulo: string
  workshopSlug: string
}) {
  if (!process.env.RESEND_API_KEY) return

  const resend = getResend()
  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Tu suscripción a "${workshopTitulo}" venció`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Tu suscripción venció</h2>
        <p>Hola <strong>${name}</strong>,</p>
        <p>Tu suscripción a <strong>${workshopTitulo}</strong> llegó a su fin. Las reservas que tenías programadas fueron canceladas automáticamente.</p>
        <p>¿Quieres continuar? Puedes renovar tu suscripción cuando quieras.</p>
        <a href="${baseUrl}/talleres/${workshopSlug}" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
          Ver el taller y renovar
        </a>
        <p style="color: #6b7280; font-size: 14px;">Si ya no deseas recibir estos avisos, puedes ignorar este correo.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
      </div>
    `,
  })
}

export async function sendSubscriptionRenovar({
  email,
  name,
  workshopTitulo,
  workshopSlug,
}: {
  email: string
  name: string
  workshopTitulo: string
  workshopSlug: string
}) {
  if (!process.env.RESEND_API_KEY) return

  const resend = getResend()
  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Es hora de renovar tu suscripción a "${workshopTitulo}"`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">¡Tu ciclo terminó!</h2>
        <p>Hola <strong>${name}</strong>,</p>
        <p>Tu período de suscripción a <strong>${workshopTitulo}</strong> terminó. Para seguir asistiendo, renueva con un clic.</p>
        <a href="${baseUrl}/talleres/${workshopSlug}" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
          Renovar suscripción
        </a>
        <p style="color: #6b7280; font-size: 14px;">Si ya no quieres renovar, simplemente ignora este correo.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
      </div>
    `,
  })
}
