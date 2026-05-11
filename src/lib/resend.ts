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
        <p>Te creamos una cuenta. Ingresa con este enlace seguro (válido <strong>48 horas</strong>, un solo uso):</p>
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
  esClasePrueba = false,
  esSuscripcion = false,
}: {
  profesorEmail: string
  profesorNombre: string
  studentName: string
  studentEmail: string
  workshopTitle: string
  slotFecha?: string
  slotHora?: string
  dashboardUrl: string
  esClasePrueba?: boolean
  esSuscripcion?: boolean
}) {
  if (!process.env.RESEND_API_KEY) return

  const resend = getResend()

  let asunto: string
  let titulo: string
  let cuerpo: string

  if (esSuscripcion) {
    asunto = `Nueva suscripción activa: ${workshopTitle}`
    titulo = '¡Nueva suscripción confirmada!'
    cuerpo = `Un alumno se suscribió al plan recurrente de <strong>${workshopTitle}</strong>.`
  } else if (esClasePrueba) {
    asunto = `Nueva clase de prueba reservada: ${workshopTitle}`
    titulo = '¡Nueva clase de prueba reservada!'
    cuerpo = `Un alumno reservó una clase de prueba en <strong>${workshopTitle}</strong>.`
  } else {
    asunto = `Nueva inscripción: ${workshopTitle}`
    titulo = '¡Nueva inscripción confirmada!'
    cuerpo = `Un alumno se inscribió en <strong>${workshopTitle}</strong>.`
  }

  await resend.emails.send({
    from: FROM_EMAIL,
    to: profesorEmail,
    subject: asunto,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">${titulo}</h2>
        <p>Hola <strong>${profesorNombre}</strong>,</p>
        <p>${cuerpo}</p>
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
        <p>Haz clic en el siguiente enlace para ingresar a tu cuenta. El enlace es válido por <strong>48 horas</strong> y solo puede usarse una vez.</p>
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

// ─── Email cancelación de sesión por tallerista ──────────────────────────────

export async function sendSesionCancelada({
  studentEmail,
  studentName,
  workshopTitle,
  fecha,
  horaInicio,
  horaFin,
  dependentNombre,
}: {
  studentEmail: string
  studentName: string
  workshopTitle: string
  fecha: string    // ej: "lunes 4 de mayo de 2026"
  horaInicio: string
  horaFin: string
  dependentNombre?: string  // si la sesión era para un dependiente
}) {
  if (!process.env.RESEND_API_KEY) return

  const resend = getResend()
  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'
  const firstName = studentName.split(' ')[0]

  // Escapar entidades HTML para evitar XSS en clientes de email
  function esc(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
  const safeFirst    = esc(firstName)
  const safeTitle    = esc(workshopTitle)
  const safeDependent = dependentNombre ? esc(dependentNombre) : undefined

  // Si la sesión era para un dependiente, personalizar saludo y cuerpo
  const saludoHtml = safeDependent
    ? `<p>Hola <strong>${safeFirst}</strong>,</p><p>El tallerista canceló la siguiente sesión de <strong>${safeTitle}</strong> para <strong>${safeDependent}</strong>:</p>`
    : `<p>Hola <strong>${safeFirst}</strong>,</p><p>El tallerista canceló la siguiente sesión de <strong>${safeTitle}</strong>:</p>`

  await resend.emails.send({
    from: FROM_EMAIL,
    to: studentEmail,
    subject: `Sesión cancelada: ${workshopTitle} — ${fecha}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Sesión cancelada</h2>
        ${saludoHtml}
        <div style="background: #fef2f2; border-left: 4px solid #ef4444; border-radius: 8px; padding: 16px 20px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Taller:</strong> ${safeTitle}</p>
          ${safeDependent ? `<p style="margin: 4px 0;"><strong>Alumno:</strong> ${safeDependent}</p>` : ''}
          <p style="margin: 4px 0;"><strong>Fecha:</strong> ${fecha}</p>
          <p style="margin: 4px 0;"><strong>Horario:</strong> ${horaInicio} – ${horaFin}</p>
        </div>
        <p>Si tienes dudas o necesitas más información, puedes responder este correo o ver tus reservas en tu panel de alumno.</p>
        <a href="${baseUrl}/alumno/reservas" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
          Ver mis reservas
        </a>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
      </div>
    `,
  })
}

/**
 * [PREPAGADO] Notifica al alumno que sus clases prepagadas se agotaron
 * y le envía link de pago MP para continuar (respetando precioSnapshot original).
 */
export async function sendPrepaidExhausted({
  email,
  name,
  workshopTitulo,
  initPoint,
  monto,
  cantidad,
}: {
  email: string
  name: string
  workshopTitulo: string
  initPoint: string
  monto: number
  cantidad: number
}) {
  if (!process.env.RESEND_API_KEY) return

  const resend = getResend()
  const montoFmt = monto.toLocaleString('es-CL')

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Completaste tus ${cantidad} clases en "${workshopTitulo}" — continúa con un clic`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">¡Felicitaciones por completar tu ciclo!</h2>
        <p>Hola <strong>${name}</strong>,</p>
        <p>Ya asististe a las <strong>${cantidad} clases</strong> de tu paquete de <strong>${workshopTitulo}</strong>.</p>
        <p>Para seguir asistiendo, paga el siguiente paquete con el mismo precio que acordaste:</p>
        <p style="font-size: 24px; font-weight: bold; color: #7c3aed; margin: 16px 0;">
          $${montoFmt} CLP
        </p>
        <a href="${initPoint}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 16px 0;">
          Pagar y continuar
        </a>
        <p style="color: #6b7280; font-size: 14px;">Si tienes dudas o prefieres otro arreglo, contacta directamente a tu profesor.</p>
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

// ─── Emancipación de dependiente ─────────────────────────────────────────────

// Notifica al alumno que el tallerista le reservó una clase
export async function sendBookingPorTallerista({
  studentEmail,
  studentName,
  workshopTitle,
  profesorNombre,
  fechaClase,
  horaClase,
  dependentNombre,
}: {
  studentEmail: string
  studentName: string
  workshopTitle: string
  profesorNombre: string
  fechaClase: string
  horaClase: string
  dependentNombre?: string
}) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[booking-por-tallerista]', { studentEmail, workshopTitle, fechaClase })
    return
  }
  const resend = getResend()
  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'
  await resend.emails.send({
    from: FROM_EMAIL,
    to: studentEmail,
    subject: dependentNombre
      ? `${profesorNombre} le reservó una clase a ${dependentNombre} en ${workshopTitle}`
      : `${profesorNombre} te reservó una clase en ${workshopTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Clase reservada${dependentNombre ? ` para ${dependentNombre}` : ''}</h2>
        <p>Hola ${studentName},</p>
        ${dependentNombre
          ? `<p>${profesorNombre} le reservó una clase a <strong>${dependentNombre}</strong> en <strong>${workshopTitle}</strong>:</p>`
          : `<p>${profesorNombre} te reservó una clase en <strong>${workshopTitle}</strong>:</p>`
        }
        <div style="background: #f5f3ff; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Fecha:</strong> ${fechaClase}</p>
          <p style="margin: 4px 0;"><strong>Hora:</strong> ${horaClase}</p>
        </div>
        <p>Puedes ver todas tus clases en tu panel de alumno:</p>
        <a href="${baseUrl}/alumno/mis-clases" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
          Ver mis clases
        </a>
        <p style="color: #6b7280; font-size: 13px;">Si necesitas cancelar o reagendar, hazlo con al menos 6 horas de anticipación desde tu panel.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
      </div>
    `,
  })
}

export async function sendEmancipationConfirmation({
  apoderadoEmail,
  apoderadoName,
  dependentNombre,
  newEmail,
  confirmUrl,
}: {
  apoderadoEmail: string
  apoderadoName: string
  dependentNombre: string
  newEmail: string
  confirmUrl: string
}) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[emancipation-confirm]', confirmUrl)
    return
  }
  const resend = getResend()
  await resend.emails.send({
    from: FROM_EMAIL,
    to: apoderadoEmail,
    subject: `Confirma: crear cuenta propia para ${dependentNombre} en Tallerea`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Confirmación requerida</h2>
        <p>Hola ${apoderadoName},</p>
        <p>Recibimos tu solicitud para crear una cuenta propia en Tallerea para <strong>${dependentNombre}</strong>
           con el email <strong>${newEmail}</strong>.</p>
        <p>Una vez confirmado:</p>
        <ul style="color: #374151;">
          <li>Se creará una cuenta independiente para ${dependentNombre}</li>
          <li>Su historial de clases quedará vinculado a esa nueva cuenta</li>
          <li>Recibirá un enlace de acceso en <strong>${newEmail}</strong></li>
          <li>${dependentNombre} dejará de aparecer en tu lista de dependientes</li>
        </ul>
        <a href="${confirmUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; margin: 16px 0; font-size: 16px;">
          Confirmar
        </a>
        <p style="color: #6b7280; font-size: 14px;">Este enlace es válido por 1 hora. Si no solicitaste esto, ignora este correo.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Tallerea.cl</p>
      </div>
    `,
  })
}

// Notifica al alumno que su reserva fue confirmada (reserva propia)
export async function sendBookingConfirmadoAlumno({
  studentEmail, studentName, workshopTitle, fechaClase, horaClase, dependentNombre,
}: {
  studentEmail: string; studentName: string; workshopTitle: string
  fechaClase: string; horaClase: string; dependentNombre?: string
}) {
  if (!process.env.RESEND_API_KEY) return
  const resend = getResend()
  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'
  const para = dependentNombre ?? studentName
  await resend.emails.send({
    from: FROM_EMAIL,
    to: studentEmail,
    subject: `Clase confirmada${dependentNombre ? ` para ${dependentNombre}` : ''} en ${workshopTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#7c3aed;">✅ Clase reservada${dependentNombre ? ` para ${dependentNombre}` : ''}</h2>
        <p>Hola ${studentName},</p>
        <p>Tu clase${dependentNombre ? ` para <strong>${para}</strong>` : ''} en <strong>${workshopTitle}</strong> quedó confirmada:</p>
        <div style="background:#f5f3ff;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Fecha:</strong> ${fechaClase}</p>
          <p style="margin:4px 0;"><strong>Hora:</strong> ${horaClase}</p>
        </div>
        <a href="${baseUrl}/alumno/mis-clases" style="display:inline-block;background:#7c3aed;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;margin:16px 0;">Ver mis clases</a>
        <p style="color:#9ca3af;font-size:12px;margin-top:32px;">— Tallerea.cl</p>
      </div>`,
  })
}

// Notifica al tallerista que un alumno reservó una clase
export async function sendNuevaReservaTallerista({
  profesorEmail, profesorNombre, studentName, workshopTitle, fechaClase, horaClase, dependentNombre,
}: {
  profesorEmail: string; profesorNombre: string; studentName: string
  workshopTitle: string; fechaClase: string; horaClase: string; dependentNombre?: string
}) {
  if (!process.env.RESEND_API_KEY) return
  const resend = getResend()
  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'
  const quien = dependentNombre ? `${dependentNombre} (apoderado: ${studentName})` : studentName
  await resend.emails.send({
    from: FROM_EMAIL,
    to: profesorEmail,
    subject: `Nueva reserva: ${quien} en ${workshopTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#7c3aed;">📅 Nueva reserva de clase</h2>
        <p>Hola ${profesorNombre},</p>
        <p><strong>${quien}</strong> reservó una clase en <strong>${workshopTitle}</strong>:</p>
        <div style="background:#f5f3ff;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Fecha:</strong> ${fechaClase}</p>
          <p style="margin:4px 0;"><strong>Hora:</strong> ${horaClase}</p>
        </div>
        <a href="${baseUrl}/tallerista/inscritos" style="display:inline-block;background:#7c3aed;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;margin:16px 0;">Ver inscritos</a>
        <p style="color:#9ca3af;font-size:12px;margin-top:32px;">— Tallerea.cl</p>
      </div>`,
  })
}

// Notifica que una reserva fue cancelada (al alumno y al tallerista por separado)
export async function sendReservaCancelada({
  email, nombre, esAlumno, workshopTitle, fechaClase, horaClase, razon, dependentNombre,
}: {
  email: string; nombre: string; esAlumno: boolean
  workshopTitle: string; fechaClase: string; horaClase: string
  razon?: string; dependentNombre?: string
}) {
  if (!process.env.RESEND_API_KEY) return
  const resend = getResend()
  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'
  const quien = dependentNombre && esAlumno ? ` para ${dependentNombre}` : ''
  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Clase cancelada${quien} en ${workshopTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#dc2626;">❌ Clase cancelada${quien}</h2>
        <p>Hola ${nombre},</p>
        <p>La clase${quien} en <strong>${workshopTitle}</strong> fue cancelada:</p>
        <div style="background:#fef2f2;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Fecha:</strong> ${fechaClase}</p>
          <p style="margin:4px 0;"><strong>Hora:</strong> ${horaClase}</p>
          ${razon ? `<p style="margin:4px 0;"><strong>Motivo:</strong> ${razon}</p>` : ''}
        </div>
        ${esAlumno ? `<p>La sesión fue devuelta a tu saldo disponible.</p><a href="${baseUrl}/alumno/mis-clases" style="display:inline-block;background:#7c3aed;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;margin:16px 0;">Ver mis clases</a>` : `<a href="${baseUrl}/tallerista/inscritos" style="display:inline-block;background:#7c3aed;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;margin:16px 0;">Ver inscritos</a>`}
        <p style="color:#9ca3af;font-size:12px;margin-top:32px;">— Tallerea.cl</p>
      </div>`,
  })
}

// Notifica al tallerista que hay un nuevo inscrito o suscriptor
export async function sendNuevoInscritoTallerista({
  profesorEmail, profesorNombre, studentName, workshopTitle, tipo, dependentNombre,
}: {
  profesorEmail: string; profesorNombre: string; studentName: string
  workshopTitle: string; tipo: 'inscripcion' | 'suscripcion'; dependentNombre?: string
}) {
  if (!process.env.RESEND_API_KEY) return
  const resend = getResend()
  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'
  const quien = dependentNombre ? `${dependentNombre} (apoderado: ${studentName})` : studentName
  const label = tipo === 'suscripcion' ? 'nuevo suscriptor' : 'nueva inscripción'
  await resend.emails.send({
    from: FROM_EMAIL,
    to: profesorEmail,
    subject: `${tipo === 'suscripcion' ? '🎉' : '✅'} ${label.charAt(0).toUpperCase() + label.slice(1)}: ${quien} en ${workshopTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#7c3aed;">${tipo === 'suscripcion' ? '🎉' : '✅'} ${label.charAt(0).toUpperCase() + label.slice(1)}</h2>
        <p>Hola ${profesorNombre},</p>
        <p><strong>${quien}</strong> se inscribió en <strong>${workshopTitle}</strong>.</p>
        <a href="${baseUrl}/tallerista/inscritos" style="display:inline-block;background:#7c3aed;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;margin:16px 0;">Ver inscritos</a>
        <p style="color:#9ca3af;font-size:12px;margin-top:32px;">— Tallerea.cl</p>
      </div>`,
  })
}

// Recordatorio semanal (lunes): alumno con suscripción activa sin reserva esta semana
export async function sendRecordatorioReservar({
  studentEmail, studentName, workshopTitle, profesorNombre,
  slotsDisponibles, magicUrl, dependentNombre,
}: {
  studentEmail: string
  studentName: string
  workshopTitle: string
  profesorNombre: string
  slotsDisponibles: Array<{ fechaTexto: string; horaTexto: string; cupoDisponible: number }>
  magicUrl?: string
  dependentNombre?: string
}) {
  if (!process.env.RESEND_API_KEY) return
  const resend = getResend()
  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'
  const destino = dependentNombre ? ` para ${dependentNombre}` : ''
  const ctaUrl = magicUrl ?? `${baseUrl}/alumno/mis-clases`

  const slotsHtml = slotsDisponibles.length > 0
    ? slotsDisponibles.map(s =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e9d5ff;">${s.fechaTexto}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e9d5ff;">${s.horaTexto}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e9d5ff;color:#7c3aed;">${s.cupoDisponible} lugar${s.cupoDisponible !== 1 ? 'es' : ''}</td>
        </tr>`
      ).join('')
    : `<tr><td colspan="3" style="padding:12px;color:#6b7280;">No hay sesiones disponibles esta semana.</td></tr>`

  await resend.emails.send({
    from: FROM_EMAIL,
    to: studentEmail,
    subject: `🎨 Tienes una clase disponible esta semana${destino} — ${workshopTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#7c3aed;">¡Agenda tu clase de esta semana!</h2>
        <p>Hola ${studentName},</p>
        <p>Tienes sesiones disponibles en <strong>${workshopTitle}</strong> con <strong>${profesorNombre}</strong>${destino}.</p>
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

        <a href="${ctaUrl}" style="display:inline-block;background:#7c3aed;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:16px;margin:8px 0;">
          Reservar mi clase →
        </a>

        <p style="color:#9ca3af;font-size:12px;margin-top:32px;">
          Si no puedes esta semana, tu sesión queda disponible para el próximo período.<br>
          — Tallerea.cl
        </p>
      </div>`,
  })
}
