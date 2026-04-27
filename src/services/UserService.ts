import 'server-only'
import { Types } from 'mongoose'
import dbConnect from '@/lib/db'
import User, { IDependent, IUser } from '@/models/User'

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
}
