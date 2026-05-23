/**
 * Envía a miseal@gmail.com una preview del email que recibirá Diego Angulo
 * cuando agote sus 8 clases del paquete (precio $0 → muestra paquetes del taller).
 *
 * Uso: npx tsx _preview_email_diego.ts
 */
import mongoose from 'mongoose'
import { sendPrepaidExhausted } from './src/lib/resend'

const WORKSHOP_ID = '69ebee808d91b3d64fccc6b1'

async function main() {
  // Forzar URL de producción para que los links del email no apunten a localhost
  process.env.NEXTAUTH_URL = 'https://tallerea.cl'

  await mongoose.connect(process.env.MONGODB_URI!)
  const db = mongoose.connection.db!

  const workshop = await db.collection('workshops').findOne(
    { _id: new mongoose.Types.ObjectId(WORKSHOP_ID) },
    { projection: { titulo: 1, slug: 1, paquetes: 1 } }
  )
  if (!workshop) throw new Error('Workshop no encontrado')

  const paquetes = (workshop.paquetes ?? [])
    .filter((p: { activo: boolean }) => p.activo)
    .sort((a: { orden: number }, b: { orden: number }) => a.orden - b.orden)
    .map((p: { nombre: string; precio: number; sesionesIncluidas: number }) => ({
      nombre: p.nombre,
      precio: p.precio,
      sesionesIncluidas: p.sesionesIncluidas,
    }))

  console.log(`Paquetes activos desde DB (${paquetes.length}):`)
  paquetes.forEach((p: { nombre: string; precio: number; sesionesIncluidas: number }) =>
    console.log(`  - ${p.nombre}: $${p.precio.toLocaleString('es-CL')} · ${p.sesionesIncluidas} clases`)
  )

  await sendPrepaidExhausted({
    email:          'miseal@gmail.com',
    name:           'Diego Angulo',
    workshopTitulo: workshop.titulo,
    workshopSlug:   workshop.slug,
    workshopId:     WORKSHOP_ID,
    cantidad:       8,
    paquetes,
  })

  console.log('✅ Email de preview enviado a miseal@gmail.com')
  await mongoose.disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
