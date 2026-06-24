/**
 * Envía invitación a "Taller Lleno" a todos los talleristas aprobados.
 * Uso: node _send_invite_taller_lleno.mjs [--dry-run]
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { Resend } from 'resend'

const DRY_RUN = process.argv.includes('--dry-run')
const WORKSHOP_URL = 'https://tallerea.cl/talleres/taller-lleno-en-2-horas-tendras-tu-pagina-lista-para-recibir-alumnos'
const INSCRIPCION_URL = `${WORKSHOP_URL}/inscribirse`
const FROM_EMAIL = 'Tallerea <noreply@tallerea.cl>'

// ── Modelo mínimo ──────────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  name:  String,
  email: String,
  role:  String,
  taller: {
    estado: String,
  },
}, { strict: false })

const User = mongoose.models.User || mongoose.model('User', UserSchema)

// ── HTML del email ─────────────────────────────────────────────────────────
function buildHtml(nombre) {
  const saludo = nombre ? nombre.split(' ')[0] : 'hola'
  return `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #111;">

  <p style="color: #7c3aed; font-weight: 600; margin-bottom: 4px;">Tallerea · para talleristas</p>
  <h1 style="font-size: 24px; margin-top: 0; line-height: 1.3;">
    ${saludo}, te invitamos a un taller gratuito pensado para ti
  </h1>

  <p>¿Cuánto tiempo perdiste esta semana en DMs de Instagram intentando coordinar inscripciones?</p>
  <p>Creamos <strong>Taller Lleno</strong> para mostrarte que hay una forma más simple.</p>

  <div style="background: #f5f3ff; border-left: 4px solid #7c3aed; padding: 20px 24px; border-radius: 0 12px 12px 0; margin: 24px 0;">
    <p style="margin: 0 0 8px; font-size: 18px; font-weight: 700;">
      Taller Lleno: en 2 horas tendrás tu página lista para recibir alumnos
    </p>
    <p style="margin: 0 0 4px; color: #6b7280;">📅 Sábado 20 de junio · 10:00 – 12:00 hrs · Online en vivo</p>
    <p style="margin: 0; font-weight: 600; color: #7c3aed;">Gratis. Sin letra chica.</p>
  </div>

  <p><strong>Al terminar la sesión tendrás:</strong></p>
  <ul style="padding-left: 20px; line-height: 1.8;">
    <li>Tu perfil de tallerista publicado y listo para ser encontrado</li>
    <li>Tu primer taller activo en Tallerea con descripción que convierte, precio, horario y botón de inscripción</li>
    <li>Una URL real que puedes compartir hoy mismo en Instagram y WhatsApp</li>
    <li>Un plan concreto de 3 acciones para conseguir tus primeros inscritos esta semana</li>
  </ul>

  <p>No necesitas experiencia previa con plataformas digitales. Solo necesitas tener claro qué enseñas, a quién y cuánto cobras.</p>

  <p>El taller también incluye una guía descargable y la grabación disponible por 7 días.</p>

  <div style="text-align: center; margin: 32px 0;">
    <a href="${INSCRIPCION_URL}"
       style="display: inline-block; background: #7c3aed; color: white; padding: 14px 36px;
              border-radius: 10px; text-decoration: none; font-size: 17px; font-weight: 600;">
      Inscribirme gratis al Taller Lleno →
    </a>
  </div>

  <p style="color: #6b7280; font-size: 14px;">
    Cupos limitados. Si no puedes ese día, inscríbete igual — tienes acceso a la grabación por 7 días.
  </p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
  <p style="color: #9ca3af; font-size: 12px; margin: 0;">
    Recibiste este mensaje porque eres tallerista en Tallerea.cl.<br>
    <a href="https://tallerea.cl" style="color: #9ca3af;">tallerea.cl</a>
  </p>
</div>
`
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  console.log('✅ Conectado a MongoDB')

  const talleristas = await User.find({
    'taller.estado': 'aprobado',
  }).select('name email').lean()

  console.log(`📋 Talleristas aprobados encontrados: ${talleristas.length}`)
  if (DRY_RUN) {
    talleristas.forEach(t => console.log(`  · ${t.name} <${t.email}>`))
    console.log('\n⚠️  DRY RUN — no se enviaron emails.')
    await mongoose.disconnect()
    return
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  let ok = 0, fail = 0

  for (const t of talleristas) {
    try {
      await resend.emails.send({
        from:    FROM_EMAIL,
        to:      t.email,
        subject: 'Te invitamos a Taller Lleno — tu página lista en 2 horas (gratis)',
        html:    buildHtml(t.name),
      })
      console.log(`  ✉️  Enviado → ${t.name} <${t.email}>`)
      ok++
      // Respetar rate limit de Resend (2 req/s en plan free)
      await new Promise(r => setTimeout(r, 600))
    } catch (err) {
      console.error(`  ❌ Error → ${t.email}:`, err.message)
      fail++
    }
  }

  console.log(`\n🏁 Completado — ${ok} enviados, ${fail} fallidos`)
  await mongoose.disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
