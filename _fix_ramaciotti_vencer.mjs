/**
 * Script puntual — Desbloquear renovación de Juan Pablo Ramaciotti (10-jun-2026)
 *
 * Problema: Sub 69fde0f4c92203fa8859ee2a quedó en estado='activa' pese a haber
 * vencido el 7-jun y tener sesionesDisponibles=0. El cron vencerLote() la omitía
 * porque clasesPrepagadas.consumidas (0) < cantidad (8) — contador obsoleto post
 * refactor Modelo A puro. Fix del cron deployado en el mismo commit.
 *
 * Este script replica exactamente lo que cerrarCiclo() haría:
 *   1. Cancela bookings futuras en estado 'reservada'.
 *   2. Marca la sub como 'vencida'.
 *   3. Registra en FinanceAuditLog (append-only).
 *
 * DRY-RUN por defecto. Pasa --apply para escribir.
 */
import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'

const APPLY = process.argv.includes('--apply')

// Resolver SRV/TXT vía DoH (Cloudflare) — DNS local de WSL no resuelve mongodb+srv
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
  const srvAns = await doh(`_mongodb._tcp.${host}`, 'SRV')
  const txtAns = await doh(host, 'TXT')
  const hosts = srvAns.map(a => {
    const p = a.data.split(/\s+/)
    return `${p[3].replace(/\.$/, '')}:${p[2]}`
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

const SUB_ID  = new mongoose.Types.ObjectId('69fde0f4c92203fa8859ee2a')
const USER_ID = new mongoose.Types.ObjectId('69fd2cc8f0b26368f3e57411')

async function main() {
  const rawUri = process.env.MONGODB_URI
  if (!rawUri) throw new Error('MONGODB_URI no definido')
  const uri = rawUri.startsWith('mongodb+srv://') ? await resolveSrvUri(rawUri) : rawUri
  await mongoose.connect(uri)
  const db = mongoose.connection.db

  console.log(`\n[${APPLY ? 'APPLY' : 'DRY-RUN'}] Fix vencimiento sub Ramaciotti\n`)

  // 1. Leer estado actual
  const sub = await db.collection('subscriptions').findOne({ _id: SUB_ID })
  if (!sub) throw new Error('Suscripción no encontrada')
  console.log(`Sub estado actual: ${sub.estado}  sesionesDisponibles: ${sub.sesionesDisponibles}  fechaVencimiento: ${sub.fechaVencimiento}`)

  if (sub.estado !== 'activa') {
    console.log('⚠️  La sub ya no está activa. No hay nada que corregir.')
    await mongoose.disconnect()
    return
  }

  // 2. Bookings futuras en estado 'reservada'
  const now = new Date()
  const bookingsFuturas = await db.collection('bookings').find({
    subscriptionId: SUB_ID,
    estado: 'reservada',
    fecha: { $gte: now },
    activo: true,
  }).toArray()
  console.log(`\nBookings futuras a cancelar (razon: ciclo_vencido): ${bookingsFuturas.length}`)
  bookingsFuturas.forEach(b => console.log(`  ${b._id}  fecha=${b.fecha}`))

  if (APPLY) {
    // 2b. Cancelar bookings futuras
    if (bookingsFuturas.length > 0) {
      const r = await db.collection('bookings').updateMany(
        { subscriptionId: SUB_ID, estado: 'reservada', fecha: { $gte: now }, activo: true },
        { $set: { estado: 'cancelada', canceladaEn: now, canceladaRazon: 'ciclo_vencido' } }
      )
      console.log(`  → ${r.modifiedCount} bookings canceladas`)
    }

    // 3. Marcar sub como vencida
    const upd = await db.collection('subscriptions').updateOne(
      { _id: SUB_ID },
      { $set: { estado: 'vencida', updatedAt: now } }
    )
    console.log(`\nSub marcada como 'vencida': modifiedCount=${upd.modifiedCount}`)

    // 4. Audit log
    await db.collection('financeauditlogs').insertOne({
      accion: 'ciclo_vencido_manual',
      entidadTipo: 'Subscription',
      entidadId: SUB_ID,
      montoAnterior: null,
      montoNuevo: null,
      userId: USER_ID,
      metadata: {
        motivo: 'vencerLote() no procesó la sub por bug en $nor (consumidas vs sesionesDisponibles). Fix manual + código corregido en mismo commit.',
        fechaVencimiento: sub.fechaVencimiento,
        sesionesDisponibles: sub.sesionesDisponibles,
        bookingsCanceladas: bookingsFuturas.length,
      },
      createdAt: now,
    })
    console.log('FinanceAuditLog insertado ✓')

    // 5. Verificación final
    const subPost = await db.collection('subscriptions').findOne({ _id: SUB_ID })
    console.log(`\nEstado final: ${subPost.estado}`)
    console.log('\n✅ Ramaciotti puede renovar su suscripción ahora.')
  } else {
    console.log('\n→ Pasa --apply para ejecutar los cambios.')
  }

  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
