import 'dotenv/config'
import mongoose, { Types } from 'mongoose'

type AccountDoc = {
  _id: Types.ObjectId
  ownerId: Types.ObjectId
  tipo: 'individual' | 'institucion'
  slug: string
  bio?: string
  especialidades?: string[]
  logo?: string
  redesSociales?: {
    instagram?: string
    web?: string
    facebook?: string
  }
  verificado?: boolean
  datosBancarios?: Record<string, unknown>
  liquidacionMinima?: number
  createdAt?: Date
  activo?: boolean
}

type UserDoc = {
  _id: Types.ObjectId
  email: string
  taller?: Record<string, unknown>
}

const mongoUri = process.env.MONGODB_URI || ''
const shouldApply = process.argv.includes('--apply')
const shouldHelp = process.argv.includes('--help') || process.argv.includes('-h')

function buildTallerPayload(account: AccountDoc) {
  return {
    estado: account.verificado ? 'aprobado' : 'pendiente',
    slug: account.slug,
    bio: account.bio || '',
    credenciales: '',
    especialidades: account.especialidades || [],
    entregaMateriales: '',
    logo: account.logo,
    redesSociales: account.redesSociales,
    datosBancarios: account.datosBancarios,
    liquidacionMinima: account.liquidacionMinima ?? 5000,
    reviewsCount: 0,
    reviewsAvg: 0,
    historial: [],
    intentos: 1,
    ultimaSolicitudEn: account.createdAt,
    suspensionesCount: 0,
  }
}

function printHelp() {
  console.log('Uso: npx tsx scripts/migrateAccountToUserTaller.ts [--apply]')
  console.log('Sin flags: audita cuentas individuales y muestra cambios sin escribir en DB.')
  console.log('--apply: escribe User.taller para owners de Account tipo individual.')
}

async function main() {
  if (shouldHelp) {
    printHelp()
    return
  }

  if (!mongoUri) {
    throw new Error('MONGODB_URI no definido')
  }

  await mongoose.connect(mongoUri)

  const db = mongoose.connection.db
  if (!db) {
    throw new Error('No fue posible acceder a la base de datos')
  }

  const accounts = await db
    .collection<AccountDoc>('accounts')
    .find({ tipo: 'individual', activo: { $ne: false } })
    .toArray()

  const users = db.collection<UserDoc>('users')
  const workshops = db.collection('workshops')
  const locations = db.collection('locations')
  const breakdowns = db.collection('paymentbreakdowns')
  const liquidations = db.collection('liquidations')

  let missingOwners = 0
  let usersWithTaller = 0
  let workshopRefs = 0
  let locationRefs = 0
  let breakdownRefs = 0
  let liquidationRefs = 0
  let applied = 0

  for (const account of accounts) {
    const owner = await users.findOne(
      { _id: account.ownerId },
      { projection: { _id: 1, email: 1, taller: 1 } }
    )

    const [workshopCount, locationCount, breakdownCount, liquidationCount] = await Promise.all([
      workshops.countDocuments({ accountId: account._id }),
      locations.countDocuments({ accountId: account._id }),
      breakdowns.countDocuments({ accountId: account._id }),
      liquidations.countDocuments({ accountId: account._id }),
    ])

    workshopRefs += workshopCount
    locationRefs += locationCount
    breakdownRefs += breakdownCount
    liquidationRefs += liquidationCount

    if (!owner) {
      missingOwners += 1
      console.log(`[WARN] Owner faltante para account ${account.slug} (${account.ownerId.toString()})`)
      continue
    }

    if (owner.taller) {
      usersWithTaller += 1
    }

    console.log(
      [
        `[PLAN] ${account.slug}`,
        `owner=${owner.email}`,
        `estado=${account.verificado ? 'aprobado' : 'pendiente'}`,
        `refs={workshops:${workshopCount},locations:${locationCount},breakdowns:${breakdownCount},liquidations:${liquidationCount}}`,
      ].join(' | ')
    )

    if (shouldApply) {
      await users.updateOne(
        { _id: owner._id },
        { $set: { taller: buildTallerPayload(account) } }
      )
      applied += 1
    }
  }

  console.log('')
  console.log(`Mode: ${shouldApply ? 'APPLY' : 'DRY-RUN'}`)
  console.log(`Accounts individuales: ${accounts.length}`)
  console.log(`Owners faltantes: ${missingOwners}`)
  console.log(`Users con taller previo: ${usersWithTaller}`)
  console.log(`Referencias workshops.accountId: ${workshopRefs}`)
  console.log(`Referencias locations.accountId: ${locationRefs}`)
  console.log(`Referencias paymentbreakdowns.accountId: ${breakdownRefs}`)
  console.log(`Referencias liquidations.accountId: ${liquidationRefs}`)
  if (shouldApply) {
    console.log(`Users actualizados con taller: ${applied}`)
  }
}

main()
  .catch((error) => {
    console.error('[MIGRATION ERROR]', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })