// scripts/fixDuplicateBreakdowns.mjs
// [FINANCE RISK][IDEMPOTENCIA][INMUTABLE]
// Detecta PaymentBreakdowns con el mismo mercadoPagoId (race condition webhook+verify),
// conserva el más antiguo y crea un AJUSTE compensatorio inmutable por cada duplicado extra.
// Luego sincroniza índices (aplica el unique sparse nuevo).
//
// Uso:
//   node scripts/fixDuplicateBreakdowns.mjs            # dry-run
//   node scripts/fixDuplicateBreakdowns.mjs --apply    # ejecuta
//
import 'dotenv/config'
import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'

// Cargar .env.local manualmente (dotenv solo lee .env)
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

// --- Resolver mongodb+srv vía DoH (WSL local DNS no resuelve TXT/SRV) ---
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
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI no definido')
  const finalUri = uri.startsWith('mongodb+srv://') ? await resolveSrvUri(uri) : uri
  await mongoose.connect(finalUri)
  const db = mongoose.connection.db
  const breakdowns = db.collection('paymentbreakdowns')
  const auditLogs = db.collection('financeauditlogs')

  console.log(`Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (solo lectura)'}\n`)

  // 1) Detectar duplicados por mercadoPagoId
  const dups = await breakdowns.aggregate([
    { $match: { mercadoPagoId: { $exists: true, $ne: null }, tipo: 'pago' } },
    { $group: {
        _id: '$mercadoPagoId',
        n: { $sum: 1 },
        docs: { $push: { _id: '$_id', createdAt: '$createdAt', montoBruto: '$montoBruto',
                         montoProfesor: '$montoProfesor', feeTallerea: '$feeTallerea',
                         workshopId: '$workshopId', ownerId: '$ownerId', studentId: '$studentId',
                         enrollmentId: '$enrollmentId', subscriptionId: '$subscriptionId',
                         porcentajeFee: '$porcentajeFee', precioModalidad: '$precioModalidad' } },
    }},
    { $match: { n: { $gt: 1 } } },
  ]).toArray()

  console.log(`Grupos de duplicados encontrados: ${dups.length}\n`)
  if (dups.length === 0) {
    console.log('Sin duplicados. Procediendo a syncIndexes...')
  }

  let totalAjustes = 0
  for (const g of dups) {
    g.docs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    const keep = g.docs[0]
    const extras = g.docs.slice(1)
    console.log(`mercadoPagoId=${g._id}  (${g.n} copias)`)
    console.log(`  KEEP    : ${keep._id} createdAt=${keep.createdAt.toISOString?.() || keep.createdAt}`)
    for (const dup of extras) {
      console.log(`  COMPENS : ${dup._id} createdAt=${dup.createdAt.toISOString?.() || dup.createdAt} monto=${dup.montoBruto}`)
      totalAjustes++
      if (APPLY) {
        // [INMUTABLE] No borramos el duplicado. Creamos ajuste con montos negativos
        // que neutralice el efecto contable. Cuadratura: -bruto = -prof + -fee.
        const ajuste = {
          enrollmentId:   dup.enrollmentId,
          subscriptionId: dup.subscriptionId,
          workshopId:     dup.workshopId,
          ownerId:        dup.ownerId,
          studentId:      dup.studentId,
          montoBruto:     -dup.montoBruto,
          comisionMP:     0,
          feeTallerea:    -dup.feeTallerea,
          montoProfesor:  -dup.montoProfesor,
          creditoAplicado: 0,
          porcentajeFee: dup.porcentajeFee,
          precioModalidad: dup.precioModalidad,
          tipo:           'ajuste',
          estado:         'cobrado',
          // [IDEMPOTENCIA] mercadoPagoId NULO → permitido por sparse index
          fechaCobro:     new Date(),
          createdAt:      new Date(),
          updatedAt:      new Date(),
        }
        // Cuadratura defensiva
        if (ajuste.montoBruto !== ajuste.montoProfesor + ajuste.feeTallerea) {
          throw new Error(`[CUADRATURA] Ajuste no cuadra para dup ${dup._id}`)
        }
        const ins = await breakdowns.insertOne(ajuste)
        await auditLogs.insertOne({
          accion: 'ajuste',
          entidadTipo: 'PaymentBreakdown',
          entidadId: ins.insertedId,
          montoAnterior: dup.montoBruto,
          montoNuevo: 0,
          userId: null,
          metadata: {
            motivo: 'Duplicado por race condition webhook+verify (faltaba unique sparse en mercadoPagoId)',
            duplicadoOriginal: dup._id,
            conservado: keep._id,
            mercadoPagoIdOriginal: g._id,
            workshopId: dup.workshopId,
          },
          createdAt: new Date(),
        })
        console.log(`    → ajuste insertado ${ins.insertedId} + audit log`)

        // [IDEMPOTENCIA] Limpiar mercadoPagoId del duplicado para liberar el índice unique.
        // Esta es la única mutación a un PaymentBreakdown — sólo borra el marcador
        // de idempotencia, NO toca montos. Auditada explícitamente.
        await breakdowns.updateOne(
          { _id: dup._id },
          { $unset: { mercadoPagoId: '' }, $set: { updatedAt: new Date() } }
        )
        await auditLogs.insertOne({
          accion: 'ajuste',
          entidadTipo: 'PaymentBreakdown',
          entidadId: dup._id,
          montoAnterior: 0,
          montoNuevo: 0,
          userId: null,
          metadata: {
            motivo: 'Liberar mercadoPagoId para permitir índice unique sparse. Montos intactos; neutralización contable vía ajuste compensatorio.',
            mercadoPagoIdRemovido: g._id,
            ajusteCompensatorio: ins.insertedId,
            conservado: keep._id,
          },
          createdAt: new Date(),
        })
        console.log(`    → mercadoPagoId removido del duplicado (auditado)`)
      }
    }
  }

  // 2) Sincronizar índices (aplica el nuevo unique sparse)
  console.log(`\nÍndices actuales:`)
  const idxBefore = await breakdowns.indexes()
  idxBefore.forEach(i => console.log(`  ${i.name}`))

  if (APPLY) {
    console.log(`\nCreando índice mercadoPagoId_unique_sparse...`)
    try {
      await breakdowns.createIndex(
        { mercadoPagoId: 1 },
        { unique: true, sparse: true, name: 'mercadoPagoId_unique_sparse' }
      )
      console.log('  ✓ índice creado')
    } catch (e) {
      console.log(`  ✗ ${e.message}`)
      if (e.code === 11000 || /duplicate/i.test(e.message)) {
        console.log('  → Aún hay duplicados sin neutralizar a nivel de unique. Revisa los ajustes.')
      }
    }
  } else {
    console.log(`\n[DRY-RUN] Se crearían ${totalAjustes} ajuste(s) compensatorios y el índice unique sparse.`)
  }

  await mongoose.disconnect()
  console.log('\nListo.')
}

main().catch(e => { console.error(e); process.exit(1) })
