import 'dotenv/config'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import mongoose from 'mongoose'

const envLocal = join(process.cwd(), '.env.local')
if (existsSync(envLocal)) {
  readFileSync(envLocal, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  })
}

async function resolveSrv(uri) {
  const m = uri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/?]+)(\/[^?]*)?(\?.*)?$/)
  if (!m) return uri
  const [, user, pass, host, dbPath = '', qs = ''] = m
  const r1 = await fetch(`https://cloudflare-dns.com/dns-query?name=_mongodb._tcp.${host}&type=SRV`, { headers: { accept: 'application/dns-json' } })
  const j1 = await r1.json()
  const hosts = (j1.Answer || []).map(a => { const p = a.data.split(/\s+/); return `${p[3].replace(/\.$/, '')}:${p[2]}` }).join(',')
  const r2 = await fetch(`https://cloudflare-dns.com/dns-query?name=${host}&type=TXT`, { headers: { accept: 'application/dns-json' } })
  const j2 = await r2.json()
  const txt = (j2.Answer || []).map(a => a.data.replace(/^"|"$/g, '')).join('&')
  const extra = qs ? qs.replace(/^\?/, '&') : ''
  return `mongodb://${user}:${pass}@${hosts}${dbPath || '/'}?ssl=true&${txt}${extra}`
}

async function main() {
  let uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI no definido')
  if (uri.startsWith('mongodb+srv://')) uri = await resolveSrv(uri)
  await mongoose.connect(uri)
  const db = mongoose.connection.db

  const owner = await db.collection('users').findOne({ email: 'miseal@gmail.com' })
  console.log(`Owner: ${owner?._id} ${owner?.name}`)

  const workshops = await db.collection('workshops').find({ ownerId: owner._id }).toArray()
  console.log(`\nTalleres del owner: ${workshops.length}`)
  workshops.forEach(w => console.log(`  ${w._id} | ${w.titulo} | modelo=${w.modeloAcceso} | activo=${w.activo}`))

  const piano = workshops.find(w => /piano|iniciaci/i.test(w.titulo))
  console.log(`\nTaller piano: ${piano?._id} - ${piano?.titulo}`)

  // Buscar Ramaciotti
  const regex = /ramaci/i
  const users = await db.collection('users').find({ $or: [{ name: regex }, { email: regex }] }).toArray()
  console.log(`\nUsuarios Ramaciotti: ${users.length}`)
  users.forEach(u => console.log(`  ${u._id} | ${u.email} | ${u.name} | credito=${u.creditoDisponible}`))

  for (const u of users) {
    console.log(`\n========================================`)
    console.log(`STUDENT: ${u.name} (${u.email}) _id=${u._id}`)
    console.log(`========================================`)

    // Subscriptions
    const subs = await db.collection('subscriptions').find({ studentId: u._id }).sort({ createdAt: -1 }).toArray()
    console.log(`\n-- Subscriptions: ${subs.length}`)
    for (const s of subs) {
      console.log(`  sub=${s._id}`)
      console.log(`    workshop=${s.workshopId} estado=${s.estado}`)
      console.log(`    sesionesDisponibles=${s.sesionesDisponibles} sesionesPorPeriodo=${s.sesionesPorPeriodo}`)
      console.log(`    periodoInicio=${s.periodoInicio} periodoFin=${s.periodoFin}`)
      console.log(`    autoRenovar=${s.autoRenovar} pagoRef=${s.pagoRef} monto=${s.monto}`)
      console.log(`    createdAt=${s.createdAt} updatedAt=${s.updatedAt}`)
    }

    // Bookings
    const bookings = await db.collection('bookings').find({ studentId: u._id }).sort({ fecha: -1 }).toArray()
    console.log(`\n-- Bookings: ${bookings.length}`)
    for (const b of bookings) {
      console.log(`  bk=${b._id}`)
      console.log(`    sub=${b.subscriptionId} workshop=${b.workshopId} slotId=${b.slotId}`)
      console.log(`    fecha=${b.fecha} estado=${b.estado}`)
      console.log(`    createdAt=${b.createdAt} updatedAt=${b.updatedAt}`)
      if (b.reagendamiento) console.log(`    reagendamiento=${JSON.stringify(b.reagendamiento)}`)
    }

    // PaymentBreakdowns
    const pbs = await db.collection('paymentbreakdowns').find({ studentId: u._id }).sort({ createdAt: -1 }).toArray()
    console.log(`\n-- PaymentBreakdowns: ${pbs.length}`)
    for (const p of pbs) {
      console.log(`  pb=${p._id} tipo=${p.tipo} mpId=${p.mpPaymentId || p.mercadoPagoId} monto=${p.montoBruto} createdAt=${p.createdAt}`)
    }
  }

  // Slots del 2 de junio en el taller
  if (piano) {
    console.log(`\n\n=== Slots taller piano alrededor del 2 de junio ===`)
    const start = new Date('2026-06-01T00:00:00Z')
    const end = new Date('2026-06-04T00:00:00Z')
    const slots = (piano.slots || []).filter(s => {
      const f = new Date(s.fechaInicio || s.fecha)
      return f >= start && f < end
    })
    slots.forEach(s => {
      console.log(`  slot=${s._id} fecha=${s.fechaInicio || s.fecha} cupo=${s.cupoMax} disp=${s.cupoDisponible} reservas=${(s.reservas||[]).length}`)
      ;(s.reservas || []).forEach(r => console.log(`    reserva: studentId=${r.studentId} bookingId=${r.bookingId} estado=${r.estado}`))
    })
  }

  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
