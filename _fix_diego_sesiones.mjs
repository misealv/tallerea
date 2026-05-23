import 'dotenv/config'
import mongoose from 'mongoose'
const { ObjectId } = mongoose.Types

// ─── IDs conocidos ────────────────────────────────────────────────────────────
const SUBSCRIPTION_ID = '69fe6c0eea13438a44eb5a2a'   // sub activa Diego Angulo
const WORKSHOP_ID      = '69ebee808d91b3d64fccc6b1'   // Programa iniciación musical al piano
const STUDENT_ID       = '69f01cc86c6c1126898d15cc'   // diegoanguloq@gmail.com

// Slots del 15 mayo (sábado) — misma lógica que slots 37+38 del 8 mayo
const SLOT_INDEX_A = 54
const SLOT_INDEX_B = 55
// Fecha equivalente a sábado 15 mayo a las 20:00 Chile (UTC-4 = 00:00 UTC del 16)
const FECHA_CLASE = new Date('2026-05-16T00:00:00.000Z')  // 15 mayo 20:00 Chile

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db

  // ── Pre-check: estado actual ───────────────────────────────────────────────
  const sub = await db.collection('subscriptions').findOne({ _id: new ObjectId(SUBSCRIPTION_ID) })
  if (!sub) throw new Error('Subscription no encontrada')

  console.log(`\n📋 Estado ANTES:`)
  console.log(`   sesionesUsadas=${sub.sesionesUsadas}  sesionesTotales=${sub.sesionesTotales}  sesionesDisponibles=${sub.sesionesDisponibles}`)
  console.log(`   clasesPrepagadas.consumidas=${sub.clasesPrepagadas?.consumidas ?? 0}`)

  // ── 1. Crear booking A (slot 54 — 15 mayo) ─────────────────────────────────
  const bookingA = {
    subscriptionId: new ObjectId(SUBSCRIPTION_ID),
    workshopId:     new ObjectId(WORKSHOP_ID),
    studentId:      new ObjectId(STUDENT_ID),
    slotIndex:      SLOT_INDEX_A,
    fecha:          FECHA_CLASE,
    estado:         'asistio',
    notaAdmin:      'Clase registrada manualmente — fecha aprox. 15 may 2026 (cotejada con cuaderno alumno)',
    createdAt:      new Date(),
    updatedAt:      new Date(),
  }

  // ── 2. Crear booking B (slot 55 — 15 mayo) ─────────────────────────────────
  const bookingB = {
    ...bookingA,
    slotIndex: SLOT_INDEX_B,
  }

  const resInsert = await db.collection('bookings').insertMany([bookingA, bookingB])
  console.log(`\n✅ Bookings creados: ${Object.values(resInsert.insertedIds).join(', ')}`)

  // ── 3. Actualizar contadores de la subscription ────────────────────────────
  const resUpdate = await db.collection('subscriptions').updateOne(
    { _id: new ObjectId(SUBSCRIPTION_ID) },
    {
      $inc: {
        sesionesUsadas:               2,
        sesionesDisponibles:         -2,
        'clasesPrepagadas.consumidas': 2,
      },
      $set: { updatedAt: new Date() }
    }
  )
  console.log(`✅ Subscription actualizada: modifiedCount=${resUpdate.modifiedCount}`)

  // ── Post-check: estado final ───────────────────────────────────────────────
  const subFinal = await db.collection('subscriptions').findOne({ _id: new ObjectId(SUBSCRIPTION_ID) })
  console.log(`\n📋 Estado DESPUÉS:`)
  console.log(`   sesionesUsadas=${subFinal.sesionesUsadas}  sesionesTotales=${subFinal.sesionesTotales}  sesionesDisponibles=${subFinal.sesionesDisponibles}`)
  console.log(`   clasesPrepagadas.consumidas=${subFinal.clasesPrepagadas?.consumidas ?? 0}`)

  const totalBookings = await db.collection('bookings').countDocuments({ subscriptionId: new ObjectId(SUBSCRIPTION_ID) })
  console.log(`\n📚 Total bookings en la subscription: ${totalBookings}`)
  console.log(`\n✅ Corrección completada. Diego Angulo ahora tiene ${subFinal.sesionesDisponibles} sesiones disponibles para agendar.`)

  await mongoose.disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
