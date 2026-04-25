/**
 * Migración: normalizar Workshop.slots[].dia sin acentos
 * 'miércoles' → 'miercoles', 'sábado' → 'sabado', etc.
 *
 * Uso:
 *   MONGODB_URI=... npx tsx scripts/migrateSlotDias.ts
 *   MONGODB_URI=... npx tsx scripts/migrateSlotDias.ts --dry-run
 */
import 'dotenv/config'
import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI || ''
const DRY_RUN = process.argv.includes('--dry-run')

function normalizeDia(dia: string): string {
  return dia.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

async function run() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI no definido.')
    process.exit(1)
  }

  await mongoose.connect(MONGODB_URI)
  console.log('Conectado a MongoDB')
  if (DRY_RUN) console.log('⚠️  DRY-RUN — no se escribirá nada\n')

  const db = mongoose.connection.db!
  const workshops = db.collection('workshops')

  // Buscar talleres que tengan al menos un slot con dia acentuado
  const acentuados = /[áéíóúüñÁÉÍÓÚÜÑ]/
  const cursor = workshops.find({ 'slots.dia': { $regex: acentuados } })

  let total = 0
  let modificados = 0

  for await (const doc of cursor) {
    total++
    const slotsOriginales = doc.slots as Array<{ dia?: string; [k: string]: unknown }>
    const slotsNormalizados = slotsOriginales.map((s) => ({
      ...s,
      dia: s.dia ? normalizeDia(s.dia) : s.dia,
    }))

    const cambios = slotsOriginales.filter((s, i) => s.dia !== slotsNormalizados[i].dia)
    console.log(`Taller: ${doc.titulo} (${doc._id})`)
    cambios.forEach((s, _) => {
      const idx = slotsOriginales.indexOf(s)
      console.log(`  slot[${idx}]: "${s.dia}" → "${slotsNormalizados[idx].dia}"`)
    })

    if (!DRY_RUN) {
      await workshops.updateOne(
        { _id: doc._id },
        { $set: { slots: slotsNormalizados } }
      )
      modificados++
    } else {
      modificados++
    }
  }

  console.log(`\nTotal talleres afectados: ${total}`)
  if (DRY_RUN) {
    console.log(`Se modificarían: ${modificados}`)
  } else {
    console.log(`Modificados: ${modificados}`)
  }

  await mongoose.disconnect()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
