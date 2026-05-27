// scripts/cancelBadLiquidation.mjs
// [FINANCE RISK][LIQUIDACION]
// Revierte una liquidación errónea en estado 'pendiente':
//   1. Encuentra la liquidación por ownerId (o la lista y deja elegir)
//   2. Revierte sus breakdowns: estado='cobrado', unset liquidationId
//   3. Elimina el documento Liquidation
//
// Uso:
//   node scripts/cancelBadLiquidation.mjs              # dry-run (muestra qué haría)
//   node scripts/cancelBadLiquidation.mjs --apply      # ejecuta
//
// Nota: Solo opera sobre liquidaciones en estado 'pendiente'.
// Una vez 'pagada', NO se puede revertir automáticamente.

import 'dotenv/config'
import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'

// Cargar .env.local manualmente
if (!process.env.MONGODB_URI) {
  const envLocal = path.join(process.cwd(), '.env.local')
  if (fs.existsSync(envLocal)) {
    fs.readFileSync(envLocal, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    })
  }
}

const APPLY = process.argv.includes('--apply')

// --- DoH helper (WSL DNS no resuelve SRV/TXT de Atlas) ---
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
  const uri = rawUri.startsWith('mongodb+srv://') ? await resolveSrvUri(rawUri) : rawUri
  await mongoose.connect(uri)
  console.log('[DB] Conectado a MongoDB Atlas')

  const db = mongoose.connection.db
  const liquidations = db.collection('liquidations')
  const breakdowns   = db.collection('paymentbreakdowns')
  const auditLogs    = db.collection('financeauditlogs')

  // Buscar todas las liquidaciones pendientes con monto sospechoso
  const pendientes = await liquidations.find({ estado: 'pendiente' }).toArray()

  if (pendientes.length === 0) {
    console.log('No hay liquidaciones en estado pendiente.')
    await mongoose.disconnect()
    return
  }

  console.log('\n=== Liquidaciones pendientes encontradas ===')
  for (const liq of pendientes) {
    // Obtener los breakdowns asociados para mostrar detalle
    const bds = await breakdowns.find({ _id: { $in: liq.breakdowns } }).toArray()
    const pagos   = bds.filter(b => b.tipo === 'pago')
    const ajustes = bds.filter(b => b.tipo === 'ajuste')
    const netos   = bds.length

    console.log(`\nLiquidación: ${liq._id}`)
    console.log(`  ownerId:       ${liq.ownerId}`)
    console.log(`  período:       ${liq.periodo?.desde?.toISOString?.() ?? liq.periodo?.desde} → ${liq.periodo?.hasta?.toISOString?.() ?? liq.periodo?.hasta}`)
    console.log(`  totalProfesor: $${liq.totalProfesor}`)
    console.log(`  totalBruto:    $${liq.totalBruto}`)
    console.log(`  cantidadPagos: ${liq.cantidadPagos} (total docs: ${netos} = ${pagos.length} pagos + ${ajustes.length} ajustes)`)
    console.log(`  createdAt:     ${liq.createdAt}`)
    console.log(`  breakdowns incluidos:`)
    for (const b of bds) {
      console.log(`    - ${b._id}  tipo=${b.tipo}  estado=${b.estado}  montoBruto=$${b.montoBruto}  montoProfesor=$${b.montoProfesor}  fechaCobro=${b.fechaCobro}`)
    }

    // Detectar si faltan ajustes pendientes para este owner (que quedaron fuera por fecha)
    const ajustesPendientes = await breakdowns.find({
      ownerId: liq.ownerId,
      tipo: 'ajuste',
      estado: 'cobrado',
      liquidationId: { $exists: false },
    }).toArray()

    if (ajustesPendientes.length > 0) {
      console.log(`  ⚠️  HAY ${ajustesPendientes.length} AJUSTE(S) PENDIENTE(S) NO INCLUIDOS EN ESTA LIQUIDACIÓN:`)
      for (const a of ajustesPendientes) {
        console.log(`       ${a._id}  montoBruto=$${a.montoBruto}  montoProfesor=$${a.montoProfesor}`)
      }
      console.log(`  → Esta liquidación es INCORRECTA y debe revertirse.`)
    }
  }

  // Si hay solo una pendiente con ajustes sueltos, revertirla
  const malas = []
  for (const liq of pendientes) {
    const ajustesPendientes = await breakdowns.find({
      ownerId: liq.ownerId,
      tipo: 'ajuste',
      estado: 'cobrado',
      liquidationId: { $exists: false },
    }).toArray()
    if (ajustesPendientes.length > 0) malas.push({ liq, ajustesPendientes })
  }

  if (malas.length === 0) {
    console.log('\n✅ No se encontraron liquidaciones incorrectas (sin ajustes pendientes sueltos).')
    await mongoose.disconnect()
    return
  }

  console.log(`\n=== ${malas.length} liquidación(es) a revertir ===`)

  for (const { liq, ajustesPendientes } of malas) {
    console.log(`\n[REVERT] Liquidación ${liq._id}  totalProfesor=$${liq.totalProfesor}`)

    if (!APPLY) {
      console.log('  [DRY-RUN] Se revertirían los siguientes breakdowns a estado=cobrado:')
      const bds = await breakdowns.find({ _id: { $in: liq.breakdowns } }).toArray()
      for (const b of bds) console.log(`    - ${b._id}  tipo=${b.tipo}  montoProfesor=$${b.montoProfesor}`)
      console.log(`  [DRY-RUN] Se eliminaría la liquidación ${liq._id}`)
      console.log(`  [DRY-RUN] Después podrás regenerar la liquidación con el monto correcto.`)
      continue
    }

    // Revertir breakdowns: estado='cobrado', eliminar liquidationId
    const res = await breakdowns.updateMany(
      { _id: { $in: liq.breakdowns } },
      { $set: { estado: 'cobrado' }, $unset: { liquidationId: '' } }
    )
    console.log(`  Breakdowns revertidos: ${res.modifiedCount}`)

    // Audit log del rollback
    await auditLogs.insertOne({
      accion: 'liquidacion_revertida',
      entidadTipo: 'Liquidation',
      entidadId: liq._id,
      montoAnterior: liq.totalProfesor,
      montoNuevo: 0,
      userId: new mongoose.Types.ObjectId('000000000000000000000000'), // sistema
      metadata: {
        razon: 'Liquidación errónea: faltaban ajustes compensatorios (fechaCobro fuera del período)',
        ajustesPendientes: ajustesPendientes.map(a => a._id),
      },
      createdAt: new Date(),
    })

    // Eliminar la liquidación errónea
    await liquidations.deleteOne({ _id: liq._id })
    console.log(`  ✅ Liquidación ${liq._id} eliminada. Ya puedes regenerarla desde /admin/liquidaciones.`)
  }

  await mongoose.disconnect()
  console.log('\n[DB] Desconectado.')
}

main().catch(err => {
  console.error('[ERROR]', err)
  process.exit(1)
})
