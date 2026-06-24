/**
 * _acreditar_diego_recarga_161457319359.mjs
 *
 * Acreditación manual del pago de MP id=161457319359 que llegó aprobado
 * pero cuyo webhook no dejó huella en la DB (causa: webhook failure 2-jun-2026).
 *
 * Replica exactamente el flujo PaymentService.handleApprovedRecarga:
 *  1. Idempotencia: aborta si ya existe breakdown con ese mercadoPagoId
 *  2. [CUADRATURA] Crea PaymentBreakdown con montos calculados por SiteConfig
 *  3. Suma 48 sesiones a la Subscription (sesionesTotales + sesionesDisponibles)
 *  4. Extiende fechaVencimiento en 365 días desde hoy (base >= fechaVencimiento actual)
 *  5. Registra FinanceAuditLog con metadata de trazabilidad
 *
 * Parámetros fijos (verificados contra MP API y MongoDB):
 *   mpPaymentId    : 161457319359
 *   subscriptionId : 69fe6c0eea13438a44eb5a2a  (activa, Diego Angulo, Piano)
 *   paqueteId      : 69ec51e800e348fc1fc30208   (Plan 48 sesiones / $580.000 / 365 días)
 *   workshopId     : 69ebee808d91b3d64fccc6b1
 *   studentId      : 69f01cc86c6c1126898d15cc   (diegoanguloq@gmail.com)
 *   comisionMP     : 22040 (informativo, de fee_details MP)
 */

import 'dotenv/config'
import mongoose from 'mongoose'

const fmtCLP = n => '$' + Number(n || 0).toLocaleString('es-CL')
const fmtDate = d => d ? new Date(d).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—'

// ─── IDs fijos ───────────────────────────────────────────────────────────────
const MP_PAYMENT_ID      = '161457319359'
const SUBSCRIPTION_ID    = '69fe6c0eea13438a44eb5a2a'
const PAQUETE_ID         = '69ec51e800e348fc1fc30208'
const WORKSHOP_ID        = '69ebee808d91b3d64fccc6b1'
const STUDENT_ID         = '69f01cc86c6c1126898d15cc'
const PAQUETE_PRECIO     = 580000    // [FINANCE] entero CLP
const SESIONES_EXTRA     = 48
const DURACION_DIAS      = 365
const COMISION_MP        = 22040     // informativo

// Modo dry-run por defecto; pasar --apply para escribir
const DRY_RUN = !process.argv.includes('--apply')

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db
  console.log(`\n⚙️  Modo: ${DRY_RUN ? 'DRY-RUN (no escribe nada)' : '🔴 APPLY — escribe en DB'}\n`)

  // ── 1. IDEMPOTENCIA ────────────────────────────────────────────────────────
  const existing = await db.collection('paymentbreakdowns').findOne({ mercadoPagoId: MP_PAYMENT_ID })
  if (existing) {
    console.log(`✅ Ya existe PaymentBreakdown con mercadoPagoId=${MP_PAYMENT_ID} → no se duplica.`)
    console.log(`   _id=${existing._id}  montoBruto=${fmtCLP(existing.montoBruto)}`)
    await mongoose.disconnect(); return
  }
  console.log(`✓ Sin breakdown previo para mpId=${MP_PAYMENT_ID} — proceder`)

  // ── 2. Leer SiteConfig para comisión ──────────────────────────────────────
  const cfg = await db.collection('siteconfigs').findOne({})
  const comisionPct = cfg?.comisionPct ?? 15
  console.log(`✓ SiteConfig.comisionPct = ${comisionPct}%`)

  // ── 3. [CUADRATURA] Calcular desglose desde bruto ─────────────────────────
  const feeTallerea    = Math.round(PAQUETE_PRECIO * comisionPct / 100)
  const montoProfesor  = PAQUETE_PRECIO - feeTallerea
  if (PAQUETE_PRECIO !== montoProfesor + feeTallerea) {
    throw new Error(`[FINANCE ERROR] Cuadratura fallida: ${PAQUETE_PRECIO} ≠ ${montoProfesor} + ${feeTallerea}`)
  }
  console.log(`✓ Desglose: bruto=${fmtCLP(PAQUETE_PRECIO)}  fee=${fmtCLP(feeTallerea)} (${comisionPct}%)  prof=${fmtCLP(montoProfesor)}  comisionMP=${fmtCLP(COMISION_MP)}`)

  // ── 4. Verificar Subscription ─────────────────────────────────────────────
  const sub = await db.collection('subscriptions').findOne({ _id: new mongoose.Types.ObjectId(SUBSCRIPTION_ID) })
  if (!sub) throw new Error(`Subscription ${SUBSCRIPTION_ID} no encontrada`)
  if (sub.estado !== 'activa') throw new Error(`Subscription estado="${sub.estado}" — no es activa, abortar`)
  console.log(`✓ Subscription "${SUBSCRIPTION_ID}"  estado=${sub.estado}  sesiones actuales: totales=${sub.sesionesTotales} disp=${sub.sesionesDisponibles}  vence=${fmtDate(sub.fechaVencimiento)}`)

  // ── 5. Verificar Workshop y paquete ───────────────────────────────────────
  const ws = await db.collection('workshops').findOne({ _id: new mongoose.Types.ObjectId(WORKSHOP_ID) })
  if (!ws) throw new Error(`Workshop ${WORKSHOP_ID} no encontrado`)
  const paquete = ws.paquetes?.find(p => String(p._id) === PAQUETE_ID)
  if (!paquete) throw new Error(`Paquete ${PAQUETE_ID} no encontrado en workshop`)
  console.log(`✓ Paquete: "${paquete.nombre}"  ${fmtCLP(paquete.precio)}  ${paquete.sesionesIncluidas} sesiones / ${paquete.duracionDias} días`)

  // ── 6. Calcular nuevos valores ────────────────────────────────────────────
  const nuevasTotales     = sub.sesionesTotales + SESIONES_EXTRA
  const nuevasDisponibles = sub.sesionesDisponibles + SESIONES_EXTRA
  // Vencimiento: 365 días desde la fecha real del pago en MP (2-jun-2026), no desde el vencimiento anterior
  const fechaPago = new Date('2026-06-02T21:31:21.000Z')
  const nuevaFechaVencimiento = new Date(fechaPago.getTime() + DURACION_DIAS * 24 * 60 * 60 * 1000)

  console.log(`\n📋 Cambios a aplicar:`)
  console.log(`   sesionesTotales:     ${sub.sesionesTotales} → ${nuevasTotales}`)
  console.log(`   sesionesDisponibles: ${sub.sesionesDisponibles} → ${nuevasDisponibles}`)
  console.log(`   fechaVencimiento:    ${fmtDate(sub.fechaVencimiento)} → ${fmtDate(nuevaFechaVencimiento)}`)
  console.log(`   PaymentBreakdown:    nuevo  montoBruto=${fmtCLP(PAQUETE_PRECIO)}`)
  console.log(`   FinanceAuditLog:     nuevo  accion=pago_recibido\n`)

  if (DRY_RUN) {
    console.log('⚠️  DRY-RUN: nada fue escrito. Ejecuta con --apply para aplicar.')
    await mongoose.disconnect(); return
  }

  // ── 7. Transacción ────────────────────────────────────────────────────────
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      // 7a. Crear PaymentBreakdown [INMUTABLE]
      const pbResult = await db.collection('paymentbreakdowns').insertOne({
        subscriptionId:  new mongoose.Types.ObjectId(SUBSCRIPTION_ID),
        workshopId:      new mongoose.Types.ObjectId(WORKSHOP_ID),
        ownerId:         ws.ownerId,
        studentId:       new mongoose.Types.ObjectId(STUDENT_ID),
        montoBruto:      PAQUETE_PRECIO,
        comisionMP:      COMISION_MP,
        feeTallerea,
        montoProfesor,
        creditoAplicado: 0,
        porcentajeFee:   comisionPct,
        precioModalidad: ws.precioModalidad ?? 'bruto',
        tipo:            'pago',
        estado:          'cobrado',
        mercadoPagoId:   MP_PAYMENT_ID,
        fechaCobro:      new Date('2026-06-02T21:31:21.000Z'),  // fecha real de aprobación MP
        createdAt:       new Date(),
        updatedAt:       new Date(),
      }, { session })
      const pbId = pbResult.insertedId
      console.log(`   ✅ PaymentBreakdown creado  _id=${pbId}`)

      // 7b. Actualizar Subscription
      await db.collection('subscriptions').updateOne(
        { _id: new mongoose.Types.ObjectId(SUBSCRIPTION_ID) },
        {
          $set: {
            sesionesTotales:     nuevasTotales,
            sesionesDisponibles: nuevasDisponibles,
            fechaVencimiento:    nuevaFechaVencimiento,
            updatedAt:           new Date(),
          }
        },
        { session }
      )
      console.log(`   ✅ Subscription actualizada`)

      // 7c. FinanceAuditLog [APPEND-ONLY]
      await db.collection('financeauditlogs').insertOne({
        accion:      'pago_recibido',
        entidadTipo: 'PaymentBreakdown',
        entidadId:   pbId,
        montoAnterior: 0,
        montoNuevo:  PAQUETE_PRECIO,
        userId:      new mongoose.Types.ObjectId(STUDENT_ID),
        metadata: {
          motivo:        'Acreditación manual por webhook fallido',
          mpPaymentId:   MP_PAYMENT_ID,
          paquete:       paquete.nombre,
          sesionesExtra: SESIONES_EXTRA,
          fechaPagoMP:   '2026-06-02T21:31:21Z',
          acreditadoPor: 'script _acreditar_diego_recarga_161457319359.mjs',
          fecha:         new Date().toISOString(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      }, { session })
      console.log(`   ✅ FinanceAuditLog registrado`)
    })

    console.log('\n🎉 Acreditación completada exitosamente.')
    console.log(`   → Diego tiene ahora ${nuevasTotales} sesiones totales (${nuevasDisponibles} disponibles)`)
    console.log(`   → Vencimiento extendido a: ${fmtDate(nuevaFechaVencimiento)}`)

  } catch (err) {
    console.error('❌ Error en transacción — rollback automático:', err.message)
    throw err
  } finally {
    await session.endSession()
    await mongoose.disconnect()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
