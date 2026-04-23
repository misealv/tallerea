import 'server-only'
import dbConnect from '@/lib/db'
import User from '@/models/User'

interface GuestUserResult {
  userId: string
  name: string
  email: string
  isNew: boolean
}

/**
 * Busca un User por email o lo crea como invitado (sin password).
 * El alumno nace de la transacción: el magic link se emitirá tras pago confirmado.
 *
 * Reglas:
 * - Si el email ya pertenece a un User con password (tallerista/admin) → reutiliza pero NO sobreescribe nombre.
 * - Si el User existe pero está inactivo → reactiva.
 * - Si no existe → crea con role:'user', sin password, activo:true.
 */
export async function findOrCreateGuestUser(
  name: string,
  email: string
): Promise<GuestUserResult> {
  await dbConnect()

  const normalizedEmail = email.trim().toLowerCase()
  const trimmedName = name.trim()

  if (!normalizedEmail || !trimmedName) {
    throw new Error('Nombre y email son requeridos')
  }

  const existing = await User.findOne({ email: normalizedEmail })

  if (existing) {
    // Reactivar si fue dado de baja
    if (!existing.activo) {
      existing.activo = true
      await existing.save()
    }
    return {
      userId: String(existing._id),
      name: existing.name,
      email: existing.email,
      isNew: false,
    }
  }

  // Crear nuevo invitado — sin password, role:'user'
  const created = await User.create({
    name: trimmedName,
    email: normalizedEmail,
    role: 'user',
    activo: true,
    creditoDisponible: 0,
  })

  return {
    userId: String(created._id),
    name: created.name,
    email: created.email,
    isNew: true,
  }
}
