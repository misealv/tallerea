import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'

// Resolver SRV/TXT vía DoH (Cloudflare) porque el DNS local de WSL no resuelve
async function doh(name, type) {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${name}&type=${type}`, {
    headers: { accept: 'application/dns-json' },
  })
  const j = await r.json()
  return j.Answer || []
}

async function resolveSrvUri(srvUri) {
  const m = srvUri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/?]+)(\/[^?]*)?(\?.*)?$/)
  if (!m) throw new Error('SRV URI inválido')
  const [, user, pass, host, dbPath = '', queryStr = ''] = m
  const srvAns = await doh(`_mongodb._tcp.${host}`, 'SRV')
  const txtAns = await doh(host, 'TXT')
  const hosts = srvAns.map(a => {
    const parts = a.data.split(/\s+/)
    return `${parts[3].replace(/\.$/, '')}:${parts[2]}`
  }).join(',')
  const txtOpts = txtAns.map(a => a.data.replace(/^"|"$/g, '')).join('&')
  const finalQuery = ['ssl=true', txtOpts, queryStr.replace(/^\?/, '')].filter(Boolean).join('&')
  return `mongodb://${user}:${pass}@${hosts}${dbPath || '/'}?${finalQuery}`
}

if (!process.env.MONGODB_URI) {
  const envLocal = path.join(process.cwd(), '.env.local')
  if (fs.existsSync(envLocal)) {
    fs.readFileSync(envLocal, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    })
  }
}

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI no definido')
  const finalUri = uri.startsWith('mongodb+srv://') ? await resolveSrvUri(uri) : uri
  await mongoose.connect(finalUri)
  const db = mongoose.connection.db

  const regex = /ramaci|ramacci|juan ?pablo/i
  const users = await db.collection('users').find({
    $or: [{ name: regex }, { email: regex }],
  }).toArray()

  console.log(`\n=== USUARIOS (regex) : ${users.length} ===`)
  for (const u of users) {
    console.log(`  _id=${u._id} email=${u.email} name="${u.name}" role=${u.role} credito=${u.creditoDisponible ?? 0} activo=${u.activo}`)
  }

  for (const u of users) {
    console.log(`\n================ SUBS de ${u.name} (${u._id}) ================`)
    const subs = await db.collection('subscriptions').find({ studentId: u._id }).sort({ createdAt: 1 }).toArray()
    console.log(`Total subs: ${subs.length}`)
    for (const s of subs) {
      const w = await db.collection('workshops').findOne({ _id: s.workshopId })
      console.log(`\n  --- SUB ${s._id} ---`)
      console.log(`    estado=${s.estado} workshop="${w?.titulo}" (${s.workshopId})`)
      console.log(`    periodoInicio=${s.periodoInicio} periodoFin=${s.periodoFin}`)
      console.log(`    fechaVencimiento=${s.fechaVencimiento} caducaEn=${s.clasesPrepagadas?.caducaEn}`)
      console.log(`    autoRenovar=${s.autoRenovar} pagoRef=${s.pagoRef || '-'} monto=${s.monto}`)
      console.log(`    sesionesUsadas=${s.sesionesUsadas} sesionesDisponibles=${s.sesionesDisponibles}`)
      console.log(`    clasesPrepagadas=${JSON.stringify(s.clasesPrepagadas)}`)
      console.log(`    createdAt=${s.createdAt} updatedAt=${s.updatedAt}`)
      if (w) {
        console.log(`    workshop.modeloAcceso=${w.modeloAcceso} activo=${w.activo} estado=${w.estado}`)
        console.log(`    workshop.plan=${JSON.stringify(w.plan)}`)
        console.log(`    workshop.precio=${w.precio} ownerId=${w.ownerId}`)
        const futureSlots = (w.slots || []).filter(sl => new Date(sl.fechaInicio) > new Date())
        console.log(`    slots futuros: ${futureSlots.length} / total ${w.slots?.length || 0}`)
        futureSlots.slice(0, 8).forEach(sl => {
          console.log(`      slot ${sl._id} ${sl.fechaInicio} cupoMax=${sl.cupoMax} cupoDisp=${sl.cupoDisponible} activo=${sl.activo}`)
        })
      }
    }

    const bookings = await db.collection('bookings').find({ studentId: u._id }).sort({ fecha: 1 }).toArray()
    console.log(`\n  Bookings: ${bookings.length}`)
    bookings.forEach(b => console.log(`    ${b._id} sub=${b.subscriptionId} fecha=${b.fecha} estado=${b.estado} razon=${b.razonCancelacion || '-'}`))
  }

  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
