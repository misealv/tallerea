// scripts/resendLiquidationEmail.mjs
// Re-envía el email de liquidación pagada a una dirección de prueba (o al mismo profesor).
//
// Uso:
//   node scripts/resendLiquidationEmail.mjs --to miseal@gmail.com
//   node scripts/resendLiquidationEmail.mjs --to miseal@gmail.com --liq <liquidationId>
//
// Si no se pasa --liq, usa la última liquidación pagada de Claudia Herrera (ownerId conocido).

import 'dotenv/config'
import mongoose from 'mongoose'
import { Resend } from 'resend'
import fs from 'fs'
import path from 'path'

// Cargar .env.local
if (!process.env.MONGODB_URI || !process.env.RESEND_API_KEY) {
  const envLocal = path.join(process.cwd(), '.env.local')
  if (fs.existsSync(envLocal)) {
    fs.readFileSync(envLocal, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([A-Z_]+[A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    })
  }
}

// ── args ──
const args = process.argv.slice(2)
const toIdx  = args.indexOf('--to');  const toEmail  = toIdx  !== -1 ? args[toIdx  + 1] : null
const liqIdx = args.indexOf('--liq'); const liqId    = liqIdx !== -1 ? args[liqIdx + 1] : null

if (!toEmail) {
  console.error('Uso: node scripts/resendLiquidationEmail.mjs --to <email> [--liq <id>]')
  process.exit(1)
}

// ── DoH helper ──
async function doh(name, type) {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${name}&type=${type}`, {
    headers: { accept: 'application/dns-json' },
  })
  return (await r.json()).Answer || []
}
async function resolveSrvUri(srvUri) {
  const m = srvUri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/?]+)(\/[^?]*)?(\?.*)?$/)
  if (!m) throw new Error('SRV URI inválido')
  const [, user, pass, host, dbPath = '', queryStr = ''] = m
  const [srvAns, txtAns] = await Promise.all([
    doh(`_mongodb._tcp.${host}`, 'SRV'),
    doh(host, 'TXT'),
  ])
  const hosts = srvAns.map(a => {
    const parts = a.data.split(/\s+/)
    return `${parts[3].replace(/\.$/, '')}:${parts[2]}`
  }).join(',')
  const txtOpts = txtAns.map(a => a.data.replace(/^"|"$/g, '')).join('&')
  const q = ['ssl=true', txtOpts, queryStr.replace(/^\?/, '')].filter(Boolean).join('&')
  return `mongodb://${user}:${pass}@${hosts}${dbPath || '/'}?${q}`
}

async function main() {
  const rawUri = process.env.MONGODB_URI
  if (!rawUri) throw new Error('MONGODB_URI no definida')
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY no definida')

  const uri = rawUri.startsWith('mongodb+srv://') ? await resolveSrvUri(rawUri) : rawUri
  await mongoose.connect(uri)
  console.log('[DB] Conectado')

  const db = mongoose.connection.db
  const liquidations = db.collection('liquidations')
  const breakdowns   = db.collection('paymentbreakdowns')
  const users        = db.collection('users')
  const workshops    = db.collection('workshops')

  // Buscar la liquidación
  let liq
  if (liqId) {
    liq = await liquidations.findOne({ _id: new mongoose.Types.ObjectId(liqId) })
  } else {
    // ownerId conocido de Claudia Herrera (jabones)
    const CLAUDIA_OWNER_ID = new mongoose.Types.ObjectId('69ea9c564aaf0a55ba51c277')
    liq = await liquidations.findOne(
      { ownerId: CLAUDIA_OWNER_ID, estado: 'pagada' },
      { sort: { createdAt: -1 } }
    )
  }

  if (!liq) {
    console.error('No se encontró liquidación pagada. Verifica el ownerId o pasa --liq <id>.')
    await mongoose.disconnect()
    process.exit(1)
  }

  console.log(`Liquidación: ${liq._id}  totalProfesor=$${liq.totalProfesor}  estado=${liq.estado}`)

  // Breakdowns
  const bds = await breakdowns.find({ _id: { $in: liq.breakdowns } }).toArray()

  // Enriquecer con workshop + alumno
  const workshopIds = Array.from(new Set(bds.map(b => String(b.workshopId))))
  const studentIds  = Array.from(new Set(bds.map(b => String(b.studentId))))

  const [wDocs, sDocs] = await Promise.all([
    workshops.find({ _id: { $in: workshopIds.map(id => new mongoose.Types.ObjectId(id)) } }).project({ _id: 1, titulo: 1 }).toArray(),
    users.find({ _id: { $in: studentIds.map(id => new mongoose.Types.ObjectId(id)) } }).project({ _id: 1, name: 1 }).toArray(),
  ])

  const wMap = Object.fromEntries(wDocs.map(w => [String(w._id), w.titulo]))
  const sMap = Object.fromEntries(sDocs.map(s => [String(s._id), s.name]))

  // Datos del tallerista (para mostrar en el log, pero overrideamos el to)
  const owner = await users.findOne(
    { _id: new mongoose.Types.ObjectId(String(liq.ownerId)) },
    { projection: { name: 1, email: 1 } }
  )
  console.log(`Tallerista: ${owner?.name} <${owner?.email}>`)
  console.log(`Enviando copia a: ${toEmail}`)

  // Construir email igual que sendLiquidacionPagada
  const FROM_EMAIL = process.env.FROM_EMAIL || 'Tallerea <noreply@tallerea.cl>'
  const baseUrl = 'https://tallerea.cl'
  const resend = new Resend(process.env.RESEND_API_KEY)

  const fmt = (d) => new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
  const clp = (n) => n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })

  const tipoLabel = { pago: 'Pago', reembolso: 'Reembolso', ajuste: 'Ajuste' }
  const tipoColor = { pago: '#16a34a', reembolso: '#d97706', ajuste: '#dc2626' }

  const filaRows = bds.map(b => `
    <tr style="border-bottom: 1px solid #f3f4f6;">
      <td style="padding: 10px 8px; color: #374151;">${wMap[String(b.workshopId)] ?? 'Taller'}</td>
      <td style="padding: 10px 8px; color: #374151;">${sMap[String(b.studentId)] ?? 'Alumno/a'}</td>
      <td style="padding: 10px 8px; text-align: center;">
        <span style="background: ${(tipoColor[b.tipo] ?? '#6b7280')}22; color: ${tipoColor[b.tipo] ?? '#6b7280'}; padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: 600;">
          ${tipoLabel[b.tipo] ?? b.tipo}
        </span>
      </td>
      <td style="padding: 10px 8px; color: #6b7280; font-size: 13px; text-align: center;">${b.fechaCobro ? fmt(b.fechaCobro) : '—'}</td>
      <td style="padding: 10px 8px; text-align: right; color: #374151;">${clp(b.montoBruto)}</td>
      <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: #111827;">${clp(b.montoProfesor)}</td>
    </tr>
  `).join('')

  const profesorNombre = owner?.name ?? 'Tallerista'
  const totalBruto     = liq.totalBruto
  const totalProfesor  = liq.totalProfesor
  const fechaPago      = liq.fechaPago ?? new Date()
  const desde          = liq.periodo.desde
  const hasta          = liq.periodo.hasta

  const comprobanteBlock = liq.comprobanteUrl
    ? `<p style="margin-top: 16px;"><a href="${liq.comprobanteUrl}" style="color: #7c3aed; text-decoration: underline; font-size: 14px;">Ver comprobante de pago</a></p>`
    : ''

  const subject = `[COPIA] ${profesorNombre} — Tallerea: tu pago de ${clp(totalProfesor)} fue acreditado`

  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: toEmail,
    subject,
    html: `
      <div style="font-family: sans-serif; max-width: 680px; margin: 0 auto; color: #111827;">
        <div style="background: #7c3aed; padding: 28px 32px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 22px;">💸 Pago acreditado</h1>
          <p style="color: #ede9fe; margin: 6px 0 0; font-size: 14px;">Tallerea.cl</p>
        </div>
        <div style="background: #ffffff; padding: 28px 32px; border: 1px solid #e5e7eb; border-top: none;">
          <p>Hola <strong>${profesorNombre}</strong>,</p>
          <p>Te informamos que hemos acreditado tu pago correspondiente al período <strong>${fmt(desde)} — ${fmt(hasta)}</strong>.</p>
          <div style="background: #f9fafb; border-radius: 10px; padding: 20px; margin: 20px 0;">
            <div style="display:inline-block; margin-right: 48px;">
              <p style="margin: 0; color: #6b7280; font-size: 13px;">Total acreditado</p>
              <p style="margin: 4px 0 0; font-size: 28px; font-weight: 700; color: #7c3aed;">${clp(totalProfesor)}</p>
            </div>
            <div style="display:inline-block;">
              <p style="margin: 0; color: #6b7280; font-size: 13px;">Fecha de pago</p>
              <p style="margin: 4px 0 0; font-size: 16px; font-weight: 600;">${fmt(fechaPago)}</p>
            </div>
          </div>
          <h3 style="font-size: 15px; color: #374151; margin: 24px 0 12px;">Detalle de pagos incluidos</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background: #f3f4f6; text-align: left;">
                <th style="padding: 10px 8px; color: #6b7280; font-weight: 600;">Taller</th>
                <th style="padding: 10px 8px; color: #6b7280; font-weight: 600;">Alumno/a</th>
                <th style="padding: 10px 8px; color: #6b7280; font-weight: 600; text-align: center;">Tipo</th>
                <th style="padding: 10px 8px; color: #6b7280; font-weight: 600; text-align: center;">Fecha cobro</th>
                <th style="padding: 10px 8px; color: #6b7280; font-weight: 600; text-align: right;">Bruto</th>
                <th style="padding: 10px 8px; color: #6b7280; font-weight: 600; text-align: right;">Tu parte</th>
              </tr>
            </thead>
            <tbody>${filaRows}</tbody>
            <tfoot>
              <tr style="background: #faf5ff; border-top: 2px solid #7c3aed;">
                <td colspan="4" style="padding: 12px 8px; font-weight: 700; color: #111827;">Total</td>
                <td style="padding: 12px 8px; text-align: right; font-weight: 700;">${clp(totalBruto)}</td>
                <td style="padding: 12px 8px; text-align: right; font-weight: 700; color: #7c3aed; font-size: 16px;">${clp(totalProfesor)}</td>
              </tr>
            </tfoot>
          </table>
          ${comprobanteBlock}
          <p style="margin-top: 24px;">
            <a href="${baseUrl}/tallerista/finanzas" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px;">
              Ver mis finanzas
            </a>
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 32px; border-top: 1px solid #f3f4f6; padding-top: 16px;">
            Este correo es un comprobante automático generado por Tallerea.cl.
          </p>
        </div>
      </div>
    `,
  })

  console.log(`\n✅ Email enviado a ${toEmail}`)
  console.log(`   Resend ID: ${result.data?.id ?? JSON.stringify(result)}`)

  await mongoose.disconnect()
  console.log('[DB] Desconectado.')
}

main().catch(err => {
  console.error('[ERROR]', err)
  process.exit(1)
})
