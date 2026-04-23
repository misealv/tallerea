import 'server-only'
import { Types } from 'mongoose'
import connectDB from '@/lib/db'
import User, { IUser, ITaller } from '@/models/User'

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
    return updated
  },
}
