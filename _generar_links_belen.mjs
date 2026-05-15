import 'dotenv/config'
import mongoose from 'mongoose'
import { MercadoPagoConfig, Preference } from 'mercadopago'

const baseUrl = 'https://tallerea.cl'
const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
const prefClient = new Preference(mp)

const SUB_IDS = [
  '6a06626aa7c917e61e7a5157', // Juan Pablo
  '6a06626ba7c917e61e7a5165', // Fernando
]

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db

  const subs = await db.collection('subscriptions').find({
    _id: { $in: SUB_IDS.map(id => new mongoose.Types.ObjectId(id)) }
  }).toArray()

  if (subs.length !== 2) { console.error('No se encontraron las 2 subs'); process.exit(1) }
  if (subs.some(s => s.sesionesUsadas > 0)) { console.error('ABORT: alguna sub tiene sesiones consumidas'); process.exit(1) }

  const workshop = await db.collection('workshops').findOne({ _id: subs[0].workshopId })
  const student = await db.collection('users').findOne({ _id: subs[0].studentId })

  console.log(`\nApoderada: ${student.name} <${student.email}>`)
  console.log(`Taller: ${workshop.titulo}`)

  for (const sub of subs) {
    // 1. Cambiar a pendiente_pago
    await db.collection('subscriptions').updateOne(
      { _id: sub._id },
      { $set: { estado: 'pendiente_pago' } }
    )

    // 2. Generar preference MP con externalRef sub:<id>
    const externalRef = `sub:${String(sub._id)}`
    const nameParts = (student.name ?? '').trim().split(/\s+/)
    const pref = await prefClient.create({
      body: {
        items: [{
          id: externalRef,
          title: `${workshop.titulo} — ${sub.dependentNombreSnapshot}`,
          quantity: 1,
          unit_price: sub.monto,
          currency_id: 'CLP',
        }],
        payer: {
          email: student.email,
          first_name: nameParts[0] ?? '',
          last_name: nameParts.slice(1).join(' ') || '',
        },
        back_urls: {
          success: `${baseUrl}/pago/exitoso`,
          failure: `${baseUrl}/pago/exitoso?estado=error`,
          pending: `${baseUrl}/pago/exitoso?estado=pendiente`,
        },
        auto_return: 'approved',
        external_reference: externalRef,
        notification_url: `${baseUrl}/api/payments/webhook`,
      },
    })

    console.log(`\n  ${sub.dependentNombreSnapshot} — $${sub.monto.toLocaleString('es-CL')}`)
    console.log(`  Link: ${pref.init_point}`)
  }

  await mongoose.disconnect()
  console.log('\nListo. Las subs quedaron en pendiente_pago. Cuando pague, el webhook las activa.')
}

main().catch(err => { console.error(err); process.exit(1) })
