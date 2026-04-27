import 'server-only'
import { Types } from 'mongoose'
import { createHmac } from 'crypto'
import mongoose from 'mongoose'
import dbConnect from '@/lib/db'
import User, { IDependent, IUser } from '@/models/User'
import Enrollment from '@/models/Enrollment'
import Subscription from '@/models/Subscription'
import Booking from '@/models/Booking'
import { issueMagicLink } from '@/lib/issueMagicLink'

// Tipo lean para User con dependientes
export type IUserWithDependents = Pick<IUser, '_id' | 'name' | 'email' | 'dependents'>

/**
 * Agrega un dependiente al array del usuario.
 * Máximo 20 dependientes activos por User (protección razonable).
 */
async function addDependent(
  userId: string,
  data: { nombre: string; fechaNacimiento?: Date; notas?: string }
): Promise<IDependent> {
  await dbConnect()

  const user = await User.findOne({ _id: userId, activo: true })
  if (!user) throw new Error('Usuario no encontrado')

  const activosCount = user.dependents.filter((d: IDependent) => d.activo).length
  if (activosCount >= 20) throw new Error('Límite de 20 dependientes activos alcanzado')

  user.dependents.push({
    _id: new Types.ObjectId(),
    nombre: data.nombre.trim(),
    fechaNacimiento: data.fechaNacimiento,
    notas: data.notas?.trim(),
    activo: true,
    createdAt: new Date(),
  })

  await user.save()

  // Retornar el subdocumento recién creado
  const added = user.dependents[user.dependents.length - 1]
  return added.toObject() as IDependent
}

/**
 * Actualiza nombre, fechaNacimiento y/o notas de un dependiente activo.
 */
async function updateDependent(
  userId: string,
  dependentId: string,
  data: { nombre?: string; fechaNacimiento?: Date | null; notas?: string | null }
): Promise<IDependent> {
  await dbConnect()

  const user = await User.findOne({ _id: userId, activo: true })
  if (!user) throw new Error('Usuario no encontrado')

  const dep = user.dependents.id(dependentId)
  if (!dep || !dep.activo) throw new Error('Dependiente no encontrado')

  if (data.nombre !== undefined) dep.nombre = data.nombre.trim()
  if (data.fechaNacimiento !== undefined) dep.fechaNacimiento = data.fechaNacimiento ?? undefined
  if (data.notas !== undefined) dep.notas = data.notas?.trim() ?? undefined

  await user.save()
  return dep.toObject() as IDependent
}

/**
 * Soft-delete de un dependiente (activo → false).
 * No elimina el subdocumento: preserva snapshots históricos en Enrollments/Bookings.
 */
async function removeDependent(userId: string, dependentId: string): Promise<void> {
  await dbConnect()

  const user = await User.findOne({ _id: userId, activo: true })
  if (!user) throw new Error('Usuario no encontrado')

  const dep = user.dependents.id(dependentId)
  if (!dep) throw new Error('Dependiente no encontrado')
  if (!dep.activo) return // ya inactivo — idempotente

  dep.activo = false
  await user.save()
}

/**
 * Lista los dependientes activos del usuario.
 */
async function listDependents(userId: string): Promise<IDependent[]> {
  await dbConnect()

  const user = await User.findOne({ _id: userId, activo: true })
    .select('dependents')
    .lean<Pick<IUser, 'dependents'>>()

  if (!user) throw new Error('Usuario no encontrado')
  return user.dependents.filter(d => d.activo)
}

/**
 * Verifica que un dependentId pertenece al userId dado.
 * Se usa en servicios de Booking/Enrollment para validar ownership.
 */
async function ownsDependent(userId: string, dependentId: string): Promise<boolean> {
  await dbConnect()
  const exists = await User.exists({
    _id: userId,
    activo: true,
    dependents: { $elemMatch: { _id: dependentId, activo: true } },
  })
  return !!exists
}

export const UserService = {
  addDependent,
  updateDependent,
  removeDependent,
  listDependents,
  ownsDependent,
  initiateEmancipation,
  confirmEmancipation,
  verifyEmancipationToken,
}

// ─── Helpers de token HMAC (stateless — sin cambios al modelo) ────────────────

function signEmancipationToken(data: {
  userId: string
  dependentId: string
  newEmail: string
  dependentNombre: string
}): string {
  const payload = JSON.stringify({
    ...data,
    expiresAt: Date.now() + 60 * 60 * 1000, // 1 hora
  })
  const sig = createHmac('sha256', process.env.NEXTAUTH_SECRET!)
    .update(payload)
    .digest('hex')
  return Buffer.from(JSON.stringify({ payload, sig })).toString('base64url')
}

function verifyEmancipationToken(token: string): {
  userId: string
  dependentId: string
  newEmail: string
  dependentNombre: string
} {
  let parsed: { payload: string; sig: string }
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString())
  } catch {
    throw new Error('Token inválido')
  }
  const expectedSig = createHmac('sha256', process.env.NEXTAUTH_SECRET!)
    .update(parsed.payload)
    .digest('hex')
  if (parsed.sig !== expectedSig) throw new Error('Token inválido')

  const data = JSON.parse(parsed.payload) as {
    userId: string; dependentId: string; newEmail: string; dependentNombre: string; expiresAt: number
  }
  if (Date.now() > data.expiresAt) throw new Error('El enlace de confirmación ha expirado')
  return { userId: data.userId, dependentId: data.dependentId, newEmail: data.newEmail, dependentNombre: data.dependentNombre }
}

/**
 * Paso 1 del flujo de emancipación: valida, firma token y envía email al apoderado.
 * No modifica ningún documento — solo crea el enlace de confirmación.
 */
async function initiateEmancipation(
  userId: string,
  dependentId: string,
  newEmail: string
): Promise<void> {
  await dbConnect()

  const user = await User.findOne({ _id: userId, activo: true })
  if (!user) throw new Error('Usuario no encontrado')

  const dep = user.dependents.id(dependentId)
  if (!dep || !dep.activo) throw new Error('Dependiente no encontrado')

  const emailNorm = newEmail.toLowerCase().trim()
  const taken = await User.exists({ email: emailNorm })
  if (taken) throw new Error('Ese email ya tiene una cuenta en Tallerea')

  const token = signEmancipationToken({
    userId,
    dependentId,
    newEmail: emailNorm,
    dependentNombre: dep.nombre,
  })

  const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'
  const confirmUrl = `${baseUrl}/confirmar-emancipacion?token=${token}`

  // Import lazy para evitar circularidad con resend
  const { sendEmancipationConfirmation } = await import('@/lib/resend')
  await sendEmancipationConfirmation({
    apoderadoEmail: user.email,
    apoderadoName: user.name,
    dependentNombre: dep.nombre,
    newEmail: emailNorm,
    confirmUrl,
  })
}

/**
 * Paso 2 del flujo de emancipación: verifica token, migra datos en transacción,
 * crea la cuenta del dependiente y le envía magic link.
 */
async function confirmEmancipation(
  token: string
): Promise<{ dependentNombre: string; newEmail: string }> {
  await dbConnect()

  const { userId, dependentId, newEmail, dependentNombre } = verifyEmancipationToken(token)

  const parentUser = await User.findOne({ _id: userId, activo: true })
  if (!parentUser) throw new Error('Usuario apoderado no encontrado')

  const dep = parentUser.dependents.id(dependentId)
  if (!dep || !dep.activo) throw new Error('El dependiente ya fue emancipado o no existe')

  const taken = await User.exists({ email: newEmail })
  if (taken) throw new Error('Ese email ya tiene una cuenta')

  const session = await mongoose.startSession()
  let newUserId = ''

  await session.withTransaction(async () => {
    const [newUser] = await User.create([{
      name: dependentNombre,
      email: newEmail,
      role: 'user',
      activo: true,
      dependents: [],
      creditoDisponible: 0,
    }], { session })
    newUserId = String(newUser._id)

    // Migrar historial: studentId → nuevo usuario, quitar dependentId
    await Enrollment.updateMany(
      { studentId: userId, dependentId },
      { $set: { studentId: newUserId }, $unset: { dependentId: '' } },
      { session }
    )
    await Subscription.updateMany(
      { studentId: userId, dependentId },
      { $set: { studentId: newUserId }, $unset: { dependentId: '' } },
      { session }
    )
    await Booking.updateMany(
      { studentId: userId, dependentId },
      { $set: { studentId: newUserId }, $unset: { dependentId: '' } },
      { session }
    )

    // Soft-delete del dependiente en el apoderado (preserva subdocumento)
    dep.activo = false
    await parentUser.save({ session })
  })

  session.endSession()

  // Fuera de transacción: emitir magic link al nuevo usuario
  const { magicUrl } = await issueMagicLink(newUserId)
  const { sendMagicLink } = await import('@/lib/resend')
  await sendMagicLink({ email: newEmail, magicUrl })

  return { dependentNombre, newEmail }
}
