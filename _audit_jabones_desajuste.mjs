import 'dotenv/config'
import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'

// Resolver SRV/TXT vía DoH (Cloudflare) porque el DNS local de WSL no resuelve
async function doh(name, type) {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${name}&type=${type}`, {
    headers: { accept: 'application/dns-json' },
  })
  const j = await r.json()
  return j.Answer || []
}

async function resolveSrvUri(srvUri) {
  // mongodb+srv://USER:PASS@HOST/DB?opts
  const m = srvUri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/?]+)(\/[^?]*)?(\?.*)?$/)
  if (!m) throw new Error('SRV URI inválido')
  const [, user, pass, host, dbPath = '', queryStr = ''] = m
  const srvAns = await doh(`_mongodb._tcp.${host}`, 'SRV')
  const txtAns = await doh(host, 'TXT')
  const hosts = srvAns.map(a => {
    // data: "0 0 27017 ac-xxxx.m9fevvg.mongodb.net."
    const parts = a.data.split(/\s+/)
    const port = parts[2]
    const target = parts[3].replace(/\.$/, '')
    return `${target}:${port}`
  }).join(',')
  const txtOpts = txtAns.map(a => a.data.replace(/^"|"$/g, '')).join('&')
  const finalQuery = [
    'ssl=true',
    txtOpts,
    queryStr.replace(/^\?/, ''),
  ].filter(Boolean).join('&')
  return `mongodb://${user}:${pass}@${hosts}${dbPath || '/'}?${finalQuery}`
}

// Cargar variables desde .env.local si .env no existe
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

  // 1. Localizar taller de jabones
  const regex = /jabon|jabón|jabones|soap/i
  console.log('=== TALLERES MATCHING /jabon/ ===')
  const workshops = await db.collection('workshops').find({
    $or: [{ titulo: regex }, { descripcion: regex }, { slug: regex }]
  }).toArray()
  workshops.forEach(w => {
    console.log(`  _id=${w._id}`)
    console.log(`    titulo=${w.titulo}`)
    console.log(`    slug=${w.slug}`)
    console.log(`    ownerId=${w.ownerId} accountId=${w.accountId}`)
    console.log(`    modeloAcceso=${w.modeloAcceso} precio=${w.precio || w.precioBruto}`)
    console.log(`    activo=${w.activo} createdAt=${w.createdAt}`)
  })

  if (workshops.length === 0) {
    console.log('Sin matches; intentando enrollments con monto 30000 recientes...')
  }

  for (const w of workshops) {
    console.log(`\n\n========== AUDIT WORKSHOP: ${w.titulo} (${w._id}) ==========`)

    // 2. Enrollments del workshop
    const enrolls = await db.collection('enrollments').find({ workshopId: w._id }).sort({ createdAt: -1 }).toArray()
    console.log(`\n--- Enrollments: ${enrolls.length} ---`)
    for (const e of enrolls) {
      const stu = e.studentId ? await db.collection('users').findOne({ _id: e.studentId }, { projection: { name: 1, email: 1 } }) : null
      console.log(`  enroll=${e._id}`)
      console.log(`    estado=${e.estado} montoPagado=${e.montoPagado} montoBruto=${e.montoBruto}`)
      console.log(`    mpPaymentId/mercadoPagoId=${e.mpPaymentId || e.mercadoPagoId || '-'} pagoRef=${e.pagoRef || '-'}`)
      console.log(`    origenInscripcion=${e.origenInscripcion || '-'} canal=${e.canal || '-'}`)
      console.log(`    student=${stu?.name} <${stu?.email}> studentId=${e.studentId}`)
      console.log(`    creditoAplicado=${e.creditoAplicado || 0}`)
      console.log(`    createdAt=${e.createdAt} updatedAt=${e.updatedAt}`)
      console.log(`    slotIndex=${e.slotIndex} slotId=${e.slotId || '-'}`)
    }

    // 3. Subscriptions del workshop
    const subs = await db.collection('subscriptions').find({ workshopId: w._id }).sort({ createdAt: -1 }).toArray()
    console.log(`\n--- Subscriptions: ${subs.length} ---`)
    for (const s of subs) {
      const stu = s.studentId ? await db.collection('users').findOne({ _id: s.studentId }, { projection: { name: 1, email: 1 } }) : null
      console.log(`  sub=${s._id} estado=${s.estado} monto=${s.monto} pagoRef=${s.pagoRef || '-'}`)
      console.log(`    student=${stu?.name} <${stu?.email}>`)
      console.log(`    origenInscripcion=${s.origenInscripcion || '-'} createdAt=${s.createdAt}`)
    }

    // 4. PaymentBreakdowns del workshop
    const breakdowns = await db.collection('paymentbreakdowns').find({ workshopId: w._id }).sort({ createdAt: -1 }).toArray()
    console.log(`\n--- PaymentBreakdowns: ${breakdowns.length} ---`)
    let totalBruto = 0, totalProfesor = 0, totalFee = 0
    for (const b of breakdowns) {
      const stu = b.studentId ? await db.collection('users').findOne({ _id: b.studentId }, { projection: { name: 1, email: 1 } }) : null
      console.log(`  bd=${b._id}`)
      console.log(`    tipo=${b.tipo} estado=${b.estado || '-'}`)
      console.log(`    mpId=${b.mercadoPagoId || b.mpPaymentId || '-'}`)
      console.log(`    montoBruto=${b.montoBruto} montoProfesor=${b.montoProfesor} feeTallerea=${b.feeTallerea} comisionMP=${b.comisionMP || 0}`)
      console.log(`    student=${stu?.name} <${stu?.email}>`)
      console.log(`    enrollmentId=${b.enrollmentId || '-'} subscriptionId=${b.subscriptionId || '-'}`)
      console.log(`    origenInscripcion=${b.origenInscripcion || '-'}`)
      console.log(`    createdAt=${b.createdAt}`)
      if (b.tipo !== 'reembolso' && b.tipo !== 'ajuste') {
        totalBruto += b.montoBruto || 0
        totalProfesor += b.montoProfesor || 0
        totalFee += b.feeTallerea || 0
      }
    }
    console.log(`\n  TOTALES BREAKDOWNS:`)
    console.log(`    Σ montoBruto    = ${totalBruto}`)
    console.log(`    Σ montoProfesor = ${totalProfesor}`)
    console.log(`    Σ feeTallerea   = ${totalFee}`)
    console.log(`    Cuadra? ${totalBruto === totalProfesor + totalFee}`)

    // 5. Cruce: enrollments pagados sin breakdown
    console.log(`\n--- CRUCE: enrollments pagados vs breakdowns ---`)
    const pagados = enrolls.filter(e => e.estado === 'pagado' || e.estado === 'confirmado' || e.montoPagado > 0)
    console.log(`  Enrollments con estado pagado/confirmado o montoPagado>0: ${pagados.length}`)
    for (const e of pagados) {
      const bd = breakdowns.find(b => String(b.enrollmentId) === String(e._id))
      const mpId = e.mpPaymentId || e.mercadoPagoId || e.pagoRef
      console.log(`    enroll=${e._id} mpId=${mpId || 'NINGUNO'} → breakdown=${bd ? bd._id : '*** SIN BREAKDOWN ***'}`)
    }

    // 6. Audit log financiero del workshop
    console.log(`\n--- FinanceAuditLog (acciones recientes con workshop) ---`)
    const logs = await db.collection('financeauditlogs').find({
      $or: [
        { 'metadata.workshopId': w._id },
        { 'metadata.workshopId': String(w._id) },
      ]
    }).sort({ createdAt: -1 }).limit(50).toArray()
    console.log(`  Logs: ${logs.length}`)
    logs.forEach(l => {
      console.log(`    ${l.createdAt?.toISOString?.() || l.createdAt} accion=${l.accion} entidad=${l.entidadTipo}/${l.entidadId} anterior=${l.montoAnterior} nuevo=${l.montoNuevo}`)
    })
  }

  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
