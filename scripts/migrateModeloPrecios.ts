/**
 * scripts/migrateModeloPrecios.ts
 * Migra workshops legacy (campo `precio` + `plan` opcionales) al nuevo modelo de precios v2.
 * Ejecución:  npx tsx scripts/migrateModeloPrecios.ts
 * Dry-run:    DRY_RUN=1 npx tsx scripts/migrateModeloPrecios.ts
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const DRY_RUN = process.env.DRY_RUN === '1'

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI no definida')
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db!
  const workshopsCol = db.collection('workshops')
  const subscriptionsCol = db.collection('subscriptions')

  const workshops = await workshopsCol.find({
    modalidadPrecio: { $exists: false },
  }).toArray()

  console.log(`Workshops a migrar: ${workshops.length}${DRY_RUN ? ' (DRY RUN)' : ''}`)

  let migratedW = 0

  for (const w of workshops) {
    const precio: number = w.precio ?? 0
    const plan = w.plan

    let update: Record<string, unknown>

    if (!plan && precio === 0) {
      // Taller gratuito sin plan
      update = {
        modalidadPrecio: 'gratuito',
        _legacyPrecio: precio,
      }
    } else if (!plan && precio > 0) {
      // Taller fijo puntual
      update = {
        modalidadPrecio: 'fijo',
        precioFijo: { monto: precio },
        _legacyPrecio: precio,
      }
    } else if (plan) {
      // Taller con plan → paquetes
      const paquete = {
        _id: new mongoose.Types.ObjectId(),
        nombre: 'Estándar',
        precio,
        sesionesIncluidas: plan.sesionesIncluidas ?? 4,
        duracionDias: 30,
        activo: true,
        orden: 0,
      }
      update = {
        modalidadPrecio: 'paquetes',
        paquetes: [paquete],
        _legacyPrecio: precio,
        _legacyPlan: plan,
      }

      // Migrar subscriptions de este workshop: agregar snapshots
      if (!DRY_RUN) {
        const subs = await subscriptionsCol.find({ workshopId: w._id }).toArray()
        for (const sub of subs) {
          // Obtener monto real del PaymentBreakdown vinculado
          let precioSnapshot = precio
          if (sub.paymentBreakdownId) {
            const bd = await db.collection('paymentbreakdowns').findOne({ _id: sub.paymentBreakdownId })
            if (bd?.montoBruto) precioSnapshot = bd.montoBruto
          }
          await subscriptionsCol.updateOne(
            { _id: sub._id },
            {
              $set: {
                paqueteId: paquete._id,
                paqueteNombreSnapshot: 'Estándar',
                precioSnapshot,
                sesionesPorPeriodoSnapshot: plan.sesionesIncluidas ?? 4,
              },
            }
          )
        }
        console.log(`  Workshop "${w.titulo}": ${subs.length} suscripciones actualizadas`)
      } else {
        console.log(`  [DRY] Workshop "${w.titulo}": se crearían paquetes + migraría subs`)
      }
    } else {
      continue
    }

    if (!DRY_RUN) {
      await workshopsCol.updateOne({ _id: w._id }, { $set: update })
    } else {
      console.log(`  [DRY] Workshop "${w.titulo}" → modalidadPrecio: ${(update as { modalidadPrecio: string }).modalidadPrecio}`)
    }
    migratedW++
  }

  console.log(`\nMigración completada: ${migratedW} workshops procesados.`)
  if (DRY_RUN) console.log('(Sin cambios — modo DRY RUN)')
  await mongoose.disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
