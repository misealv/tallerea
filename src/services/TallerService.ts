import 'server-only'
import { Types } from 'mongoose'
import connectDB from '@/lib/db'
import User, { IUser, ITaller } from '@/models/User'
import {
  sendTallerSolicitudAdmin,
  sendTallerSolicitudRecibida,
  sendTallerAprobado,
  sendTallerRechazado,
  sendTallerSuspendido,
  sendTallerReactivado,
} from '@/lib/resend'

// Payload mínimo para solicitar ser tallerista
export interface SolicitudTallerData {
  slug: string
  bio: string
  credenciales: string
  especialidades: string[]
  entregaMateriales: string
  liquidacionMinima?: number
  logo?: string
  redesSociales?: ITaller['redesSociales']
}

export const TallerService = {
  /**
   * Un User solicita convertirse en tallerista.
   * Valida cooldown si hubo rechazo previo (usa SiteConfig.diasCooldownRepostulacion).
   */
  async solicitar(userId: string, data: SolicitudTallerData): Promise<IUser> {
    await connectDB()

    const user = await User.findOne({ _id: userId, activo: true })
    if (!user) throw new Error('Usuario no encontrado')

    if (user.taller?.estado === 'aprobado') {
      throw new Error('El usuario ya es tallerista aprobado')
    }

    // Un suspendido solo puede ser reactivado por un admin, no re-postular
    if (user.taller?.estado === 'suspendido') {
      throw new Error('Tu cuenta de tallerista está suspendida. Contacta a soporte para reactivarla.')
    }

    // Validar cooldown post-rechazo (30 días por defecto)
    if (user.taller?.estado === 'rechazado' && user.taller.ultimoRechazoEn) {
      const diasDesdeRechazo = Math.floor(
        (Date.now() - user.taller.ultimoRechazoEn.getTime()) / (1000 * 60 * 60 * 24)
      )
      if (diasDesdeRechazo < 30) {
        throw new Error(
          `Debe esperar ${30 - diasDesdeRechazo} días más antes de re-postular`
        )
      }
    }

    // Verificar slug único
    const slugExistente = await User.findOne({ 'taller.slug': data.slug, _id: { $ne: userId } })
    if (slugExistente) throw new Error(`El slug "${data.slug}" ya está en uso`)

    const esRepostulacion = !!user.taller

    const historialEntry = {
      accion: esRepostulacion ? 're_postulacion' : 'solicitud',
      fecha: new Date(),
    } as const

    await User.updateOne(
      { _id: userId },
      {
        $set: {
          'taller.estado': 'pendiente',
          'taller.slug': data.slug,
          'taller.bio': data.bio,
          'taller.credenciales': data.credenciales,
          'taller.especialidades': data.especialidades,
          'taller.entregaMateriales': data.entregaMateriales,
          'taller.liquidacionMinima': data.liquidacionMinima ?? 5000,
          'taller.logo': data.logo,
          'taller.redesSociales': data.redesSociales,
          'taller.ultimaSolicitudEn': new Date(),
          'taller.reviewsCount': user.taller?.reviewsCount ?? 0,
          'taller.reviewsAvg': user.taller?.reviewsAvg ?? 0,
          'taller.suspensionesCount': user.taller?.suspensionesCount ?? 0,
          'taller.historial': [
            ...(user.taller?.historial ?? []),
            historialEntry,
          ],
        },
        $inc: { 'taller.intentos': 1 },
      }
    )

    const updated = await User.findById(userId).lean<IUser>()
    if (!updated) throw new Error('Error al recuperar usuario actualizado')

    // Email al admin sobre nueva solicitud
    await sendTallerSolicitudAdmin({
      userId,
      userName: updated.name,
      userEmail: updated.email,
      bio: data.bio,
    }).catch(() => null) // no bloquear si falla el email

    // Acuse de recibo al tallerista
    await sendTallerSolicitudRecibida({
      email: updated.email,
      name: updated.name,
      esRepostulacion,
    }).catch(() => null)

    return updated
  },

  /**
   * Admin aprueba una solicitud pendiente.
   * [TALLER ESTADO]
   */
  async aprobar(userId: string, adminId: string): Promise<IUser> {
    await connectDB()

    const user = await User.findOne({ _id: userId, activo: true })
    if (!user) throw new Error('Usuario no encontrado')
    if (user.taller?.estado !== 'pendiente') {
      throw new Error(`No se puede aprobar: estado actual es "${user.taller?.estado ?? 'sin taller'}"`)
    }

    await User.updateOne(
      { _id: userId },
      {
        $set: { 'taller.estado': 'aprobado' },
        $push: {
          'taller.historial': {
            accion: 'aprobacion',
            fecha: new Date(),
            adminId: new Types.ObjectId(adminId),
          },
        },
      }
    )

    const updated = await User.findById(userId).lean<IUser>()
    if (!updated) throw new Error('Error al recuperar usuario actualizado')

    await sendTallerAprobado({ email: updated.email, name: updated.name }).catch(() => null)

    return updated
  },

  /**
   * Admin rechaza una solicitud pendiente.
   * [TALLER ESTADO]
   */
  async rechazar(userId: string, adminId: string, razon: string): Promise<IUser> {
    await connectDB()

    const user = await User.findOne({ _id: userId, activo: true })
    if (!user) throw new Error('Usuario no encontrado')
    if (user.taller?.estado !== 'pendiente') {
      throw new Error(`No se puede rechazar: estado actual es "${user.taller?.estado ?? 'sin taller'}"`)
    }

    await User.updateOne(
      { _id: userId },
      {
        $set: {
          'taller.estado': 'rechazado',
          'taller.ultimoRechazoEn': new Date(),
        },
        $push: {
          'taller.historial': {
            accion: 'rechazo',
            fecha: new Date(),
            adminId: new Types.ObjectId(adminId),
            razon,
            snapshotPerfil: {
              bio: user.taller?.bio ?? '',
              credenciales: user.taller?.credenciales ?? '',
            },
          },
        },
      }
    )

    const updated = await User.findById(userId).lean<IUser>()
    if (!updated) throw new Error('Error al recuperar usuario actualizado')

    await sendTallerRechazado({ email: updated.email, name: updated.name, razon }).catch(() => null)

    return updated
  },

  /**
   * Admin suspende un tallerista aprobado.
   * [TALLER ESTADO]
   */
  async suspender(userId: string, adminId: string, razon: string): Promise<IUser> {
    await connectDB()

    const user = await User.findOne({ _id: userId, activo: true })
    if (!user) throw new Error('Usuario no encontrado')
    if (user.taller?.estado !== 'aprobado') {
      throw new Error(`No se puede suspender: estado actual es "${user.taller?.estado ?? 'sin taller'}"`)
    }

    await User.updateOne(
      { _id: userId },
      {
        $set: { 'taller.estado': 'suspendido' },
        $inc: { 'taller.suspensionesCount': 1 },
        $push: {
          'taller.historial': {
            accion: 'suspension',
            fecha: new Date(),
            adminId: new Types.ObjectId(adminId),
            razon,
          },
        },
      }
    )

    const updated = await User.findById(userId).lean<IUser>()
    if (!updated) throw new Error('Error al recuperar usuario actualizado')

    await sendTallerSuspendido({ email: updated.email, name: updated.name, razon }).catch(() => null)

    return updated
  },

  /**
   * Admin reactiva un tallerista suspendido.
   * [TALLER ESTADO]
   */
  async reactivar(userId: string, adminId: string): Promise<IUser> {
    await connectDB()

    const user = await User.findOne({ _id: userId, activo: true })
    if (!user) throw new Error('Usuario no encontrado')
    if (user.taller?.estado !== 'suspendido') {
      throw new Error(`No se puede reactivar: estado actual es "${user.taller?.estado ?? 'sin taller'}"`)
    }

    await User.updateOne(
      { _id: userId },
      {
        $set: { 'taller.estado': 'aprobado' },
        $push: {
          'taller.historial': {
            accion: 'reactivacion',
            fecha: new Date(),
            adminId: new Types.ObjectId(adminId),
          },
        },
      }
    )

    const updated = await User.findById(userId).lean<IUser>()
    if (!updated) throw new Error('Error al recuperar usuario actualizado')

    await sendTallerReactivado({ email: updated.email, name: updated.name }).catch(() => null)

    return updated
  },

  /** Lista todos los talleristas con estado dado (o todos si no se pasa filtro) */
  async listar(estado?: ITaller['estado']): Promise<IUser[]> {
    await connectDB()
    const filter = estado ? { 'taller.estado': estado } : { 'taller.estado': { $exists: true } }
    return User.find({ ...filter, activo: true })
      .select('-password -magicLinkToken -magicLinkExpiresAt')
      .lean<IUser[]>()
  },

  /** Devuelve un tallerista por su userId */
  async getById(userId: string): Promise<IUser | null> {
    await connectDB()
    return User.findOne({ _id: userId, 'taller.estado': { $exists: true }, activo: true })
      .select('-password -magicLinkToken -magicLinkExpiresAt')
      .lean<IUser>()
  },

  /**
   * El propio tallerista actualiza su perfil público.
   * Solo campos editables por el tallerista: bio, credenciales, especialidades,
   * entregaMateriales, logo, redesSociales.
   * NO toca: estado, slug, historial, datosBancarios.
   */
  async actualizarPerfil(
    userId: string,
    data: Pick<SolicitudTallerData, 'bio' | 'credenciales' | 'especialidades' | 'entregaMateriales' | 'logo' | 'redesSociales'> & { name?: string; formacion?: string; documentosCredenciales?: string[] }
  ): Promise<IUser> {
    await connectDB()

    const user = await User.findOne({ _id: userId, 'taller.estado': 'aprobado', activo: true })
    if (!user) throw new Error('Tallerista no encontrado o no aprobado')

    const $set: Record<string, unknown> = {
      'taller.bio': data.bio,
      'taller.formacion': data.formacion ?? '',
      'taller.credenciales': data.credenciales,
      'taller.especialidades': data.especialidades,
      'taller.entregaMateriales': data.entregaMateriales,
      'taller.documentosCredenciales': data.documentosCredenciales ?? [],
    }
    if (data.name) $set['name'] = data.name
    if (data.logo !== undefined) $set['taller.logo'] = data.logo
    if (data.redesSociales !== undefined) $set['taller.redesSociales'] = data.redesSociales

    await User.updateOne({ _id: userId }, { $set })

    const updated = await User.findById(userId)
      .select('-password -magicLinkToken -magicLinkExpiresAt')
      .lean<IUser>()
    if (!updated) throw new Error('Error al recuperar usuario actualizado')
    return updated
  },
}
