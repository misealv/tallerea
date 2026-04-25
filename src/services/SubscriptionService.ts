import mongoose from 'mongoose'
import dbConnect from '@/lib/db'
import Subscription, { ISubscription } from '@/models/Subscription'
import Booking from '@/models/Booking'
import Workshop from '@/models/Workshop'
import User from '@/models/User'
import { FinanceService } from '@/services/FinanceService'
import { SiteConfigService } from '@/services/SiteConfigService'
import { createPaymentPreference } from '@/lib/mercadopago'
import { sendSubscriptionVencida, sendSubscriptionRenovar } from '@/lib/resend'

interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

interface CreateSubscriptionResult {
  subscription: ISubscription
  preferenceId?: string | null
  initPoint?: string | null
  free?: boolean
}

// Calcula fechaVencimiento según vigencia del plan
function calcularVencimiento(vigencia: string, fechaCompra: Date): Date {
  const d = new Date(fechaCompra)
  if (vigencia === 'mensual') {
    d.setMonth(d.getMonth() + 1)
  } else if (vigencia === 'por_ciclo') {
    d.setMonth(d.getMonth() + 3)
  } else {
    // sin_vencimiento → 1 año como tope técnico
    d.setFullYear(d.getFullYear() + 1)
  }
  return d
}

export const SubscriptionService = {

  async getAll(
    filters?: Record<string, unknown>,
    page = 1,
    limit = 20
  ): Promise<PaginatedResult<ISubscription>> {
    await dbConnect()
    const query = { activo: true, ...filters }
    const [data, total] = await Promise.all([
      Subscription.find(query)
        .populate('workshopId', 'titulo slug')
        .populate('studentId', 'name email')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean<ISubscription[]>(),
      Subscription.countDocuments(query),
    ])
    return { data, total, page, limit }
  },

  async getById(id: string): Promise<ISubscription | null> {
    await dbConnect()
    return Subscription.findOne({ _id: id, activo: true })
      .populate('workshopId', 'titulo slug precio plan')
      .populate('studentId', 'name email')
      .lean<ISubscription>()
  },

  async getByStudentAndWorkshop(
    studentId: string,
    workshopId: string
  ): Promise<ISubscription | null> {
    await dbConnect()
    return Subscription.findOne({
      studentId, workshopId, estado: 'activa', activo: true,
    }).lean<ISubscription>()
  },

  // [FINANCE RISK] Crea suscripción en estado 'pendiente_pago' + preferencia MP.
  // El PaymentBreakdown se crea en handleApprovedSubscription al confirmar el pago.
  async createWithPayment(
    workshopId: string,
    studentId: string,
    studentEmail: string,
    paqueteId?: string,
  ): Promise<CreateSubscriptionResult> {
    await dbConnect()

    const workshop = await Workshop.findOne({ _id: workshopId, activo: true })
    if (!workshop) throw new Error('Taller no encontrado')

    // Resolver monto y sesiones según modalidadPrecio
    let monto: number
    let sesiones: number
    let vigencia: string
    let paqueteNombre: string | undefined
    let paqueteIdResuelto: string | undefined

    const mp = workshop.modalidadPrecio ?? 'fijo'

    if (mp === 'paquetes') {
      if (!workshop.paquetes || workshop.paquetes.length === 0) {
        throw new Error('Este taller no tiene paquetes configurados')
      }
      // Buscar paquete solicitado o el primero activo
      type PaqueteItem = (typeof workshop.paquetes)[number]
      const paquete = paqueteId
        ? workshop.paquetes.find((p: PaqueteItem) => String(p._id) === paqueteId && p.activo)
        : workshop.paquetes.find((p: PaqueteItem) => p.activo)
      if (!paquete) throw new Error('Paquete no encontrado o inactivo')
      // [FINANCE RISK] Si precioModalidad es 'neto', convertir a precio bruto para cobrar al alumno
      const precioBasePaquete = paquete.precio
      if (workshop.precioModalidad === 'neto' && precioBasePaquete > 0) {
        const comisionPct = await SiteConfigService.getComisionPct()
        monto = FinanceService.calcularPrecioDesdeNeto(precioBasePaquete, comisionPct)
      } else {
        monto = precioBasePaquete
      }
      sesiones = paquete.sesionesIncluidas
      vigencia = 'mensual'   // duracionDias del paquete; usar calcularVencimiento con días
      paqueteNombre = paquete.nombre
      paqueteIdResuelto = String(paquete._id)
    } else if (mp === 'gratuito') {
      monto = 0
      sesiones = workshop.plan?.sesionesIncluidas ?? 999
      vigencia = workshop.plan?.vigencia ?? 'mensual'
    } else if (workshop.plan) {
      // Compat legacy — también convertir si precioModalidad es neto
      const precioLegacy = workshop.precio
      if (workshop.precioModalidad === 'neto' && precioLegacy > 0) {
        const comisionPct = await SiteConfigService.getComisionPct()
        monto = FinanceService.calcularPrecioDesdeNeto(precioLegacy, comisionPct)
      } else {
        monto = precioLegacy
      }
      sesiones = workshop.plan.sesionesIncluidas
      vigencia = workshop.plan.vigencia
    } else {
      throw new Error('Este taller no tiene plan de suscripción configurado')
    }

    // Verificar que no exista suscripción activa
    const existing = await Subscription.findOne({
      workshopId, studentId, estado: 'activa',
    })
    if (existing) throw new Error('Ya tienes una suscripción activa en este taller')

    // Verificar cupo máximo de alumnos activos
    if (workshop.maxAlumnosActivos) {
      const activeCount = await Subscription.countDocuments({
        workshopId, estado: 'activa',
      })
      if (activeCount >= workshop.maxAlumnosActivos) {
        throw new Error('El taller llegó al máximo de alumnos activos')
      }
    }

    const fechaCompra = new Date()
    // Usar duracionDias del paquete si está disponible
    let fechaVencimiento: Date
    if (mp === 'paquetes' && paqueteId) {
      type PaqueteItemB = NonNullable<typeof workshop.paquetes>[number]
      const pq = workshop.paquetes?.find((p: PaqueteItemB) => String(p._id) === paqueteIdResuelto)
      if (pq?.duracionDias) {
        fechaVencimiento = new Date(fechaCompra.getTime() + pq.duracionDias * 24 * 60 * 60 * 1000)
      } else {
        fechaVencimiento = calcularVencimiento('mensual', fechaCompra)
      }
    } else {
      fechaVencimiento = calcularVencimiento(vigencia, fechaCompra)
    }

    // [FINANCE] Crear suscripción en estado 'pendiente_pago'.
    // El PaymentBreakdown NO se crea acá — se difiere a handleApprovedSubscription
    // cuando MercadoPago confirme el pago (Principio #10: nunca registrar dinero antes de confirmación).
    const estadoInicial = monto === 0 ? 'activa' : 'pendiente_pago'
    const subscription = await new Subscription({
      workshopId,
      studentId,
      estado: estadoInicial,
      sesionesTotales: sesiones,
      sesionesUsadas: 0,
      sesionesDisponibles: sesiones,
      fechaCompra,
      fechaVencimiento,
      monto,
      // Snapshot del paquete — inmutable post-creación
      ...(paqueteIdResuelto && {
        paqueteId:                  paqueteIdResuelto,
        paqueteNombreSnapshot:      paqueteNombre,
        precioSnapshot:             monto,
        sesionesPorPeriodoSnapshot: sesiones,
      }),
    }).save()

    // Taller gratuito → completar sin pago
    if (monto === 0) {
      return { subscription, free: true }
    }

    // Crear preferencia MercadoPago — prefijo 'sub:' identifica subscription
    const preference = await createPaymentPreference({
      externalRef: `sub:${String(subscription._id)}`,
      workshopTitle: workshop.titulo,
      amount: monto,
      payerEmail: studentEmail,
    })

    return {
      subscription,
      preferenceId: preference.id,
      initPoint: preference.init_point,
    }
  },

  // Renovar suscripción: vencida→cancelada, nueva activa
  async renew(subscriptionId: string, studentEmail: string): Promise<CreateSubscriptionResult> {
    await dbConnect()
    const prev = await Subscription.findById(subscriptionId)
    if (!prev) throw new Error('Suscripción no encontrada')
    if (prev.estado === 'activa') throw new Error('La suscripción aún está activa')

    prev.estado = 'vencida'
    await prev.save()

    // Preservar paqueteId del snapshot para renovar con el mismo paquete
    const paqueteIdPrev = prev.paqueteId ? String(prev.paqueteId) : undefined

    return this.createWithPayment(
      String(prev.workshopId),
      String(prev.studentId),
      studentEmail,
      paqueteIdPrev,
    )
  },

  // Cancelar suscripción (soft)
  async cancel(subscriptionId: string): Promise<ISubscription | null> {
    await dbConnect()
    const sub = await Subscription.findById(subscriptionId)
    if (!sub) throw new Error('Suscripción no encontrada')
    sub.estado = 'cancelada'
    await sub.save()
    return sub
  },

  // Consumir 1 sesión (llamado por BookingService) — [RACE] atómico
  async consumeSesion(subscriptionId: string): Promise<ISubscription> {
    await dbConnect()
    const now = new Date()
    const updated = await Subscription.findOneAndUpdate(
      {
        _id: subscriptionId,
        estado: 'activa',
        sesionesDisponibles: { $gt: 0 },
        fechaVencimiento: { $gt: now },
      },
      { $inc: { sesionesUsadas: 1, sesionesDisponibles: -1 } },
      { new: true }
    ).lean<ISubscription>()
    if (!updated) {
      // Distinguir causa
      const sub = await Subscription.findById(subscriptionId).lean<ISubscription>()
      if (!sub) throw new Error('Suscripción no encontrada')
      if (sub.estado !== 'activa') throw new Error('Suscripción no activa')
      if (sub.fechaVencimiento < now) throw new Error('Suscripción vencida')
      throw new Error('No quedan sesiones disponibles')
    }
    return updated
  },

  // Devolver 1 sesión (cancelación de booking) — [RACE] atómico, con tope superior
  async devolverSesion(subscriptionId: string): Promise<ISubscription> {
    await dbConnect()
    // Solo devolver si sesionesUsadas > 0 — evita acumular por double-cancel
    const updated = await Subscription.findOneAndUpdate(
      { _id: subscriptionId, sesionesUsadas: { $gt: 0 } },
      { $inc: { sesionesUsadas: -1, sesionesDisponibles: 1 } },
      { new: true }
    ).lean<ISubscription>()
    if (!updated) {
      // No-op idempotente: si no había sesiones usadas, retornar el estado actual sin mutar
      const sub = await Subscription.findById(subscriptionId).lean<ISubscription>()
      if (!sub) throw new Error('Suscripción no encontrada')
      return sub
    }
    return updated
  },

  /**
   * [CICLO] Cierra una suscripción vencida: cancela bookings futuras y envía email.
   * Si autoRenovar=true → email con link para re-suscribirse.
   * Si autoRenovar=false → email de vencimiento simple.
   * No procesa cobro automático (MP Checkout Pro no soporta cargo recurrente sin tarjeta guardada).
   */
  async cerrarCiclo(sub: ISubscription): Promise<void> {
    await dbConnect()

    const now = new Date()

    // [CICLO] Operaciones de escritura envueltas en transacción
    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        // 1. Cancelar todas las bookings futuras en estado 'reservada'
        await Booking.updateMany(
          { subscriptionId: sub._id, estado: 'reservada', fecha: { $gte: now }, activo: true },
          { $set: { estado: 'cancelada', canceladaEn: now, canceladaRazon: 'ciclo_vencido' } },
          { session }
        )
        // 2. Marcar suscripción como vencida
        await Subscription.findByIdAndUpdate(sub._id, { estado: 'vencida' }, { session })
      })
    } finally {
      await session.endSession()
    }

    // 3. Obtener datos del alumno y el taller para el email
    const [student, workshop] = await Promise.all([
      User.findById(sub.studentId).select('name email').lean<{ _id: mongoose.Types.ObjectId; name: string; email: string }>(),
      Workshop.findById(sub.workshopId).select('titulo slug').lean<{ _id: mongoose.Types.ObjectId; titulo: string; slug: string }>(),
    ])

    if (!student?.email || !workshop) return

    // 4. Extender slots si la ventana futura es < 4 semanas
    const workshopFull = await Workshop.findById(sub.workshopId)
      .select('slots tipoRecurrencia plantillaSemanal recurrencia activo modeloAcceso').lean()
    const wf = workshopFull as unknown as { activo: boolean; tipoRecurrencia?: string; slots: { fecha?: Date }[] } | null
    if (wf && wf.activo && wf.tipoRecurrencia === 'semanal') {
      const futureSlotsN = (wf.slots ?? []).filter(s => s.fecha && new Date(s.fecha) > now).length
      if (futureSlotsN < 4) {
        import('@/services/SlotGeneratorService').then(({ SlotGeneratorService }) =>
          SlotGeneratorService.applyGeneratedSlots(String(sub.workshopId)).catch(() => null)
        )
      }
    }

    // 5. Enviar email según preferencia del alumno
    if (sub.autoRenovar) {
      await sendSubscriptionRenovar({
        email: student.email,
        name: student.name,
        workshopTitulo: workshop.titulo,
        workshopSlug: workshop.slug,
      }).catch(() => null)
    } else {
      await sendSubscriptionVencida({
        email: student.email,
        name: student.name,
        workshopTitulo: workshop.titulo,
        workshopSlug: workshop.slug,
      }).catch(() => null)
    }
  },

  /**
   * [CICLO] Procesa todas las suscripciones activas cuyo fechaVencimiento < now.
   * Diseñado para el cron diario. Procesa en batches de 100 para no exceder el timeout de Vercel.
   * Retorna conteo de suscripciones procesadas.
   */
  async vencerLote(): Promise<{ procesadas: number; errores: number }> {
    await dbConnect()

    const now = new Date()
    let procesadas = 0
    let errores = 0
    const BATCH = 100
    // IDs ya intentados en este run — evita loop infinito si cerrarCiclo falla siempre
    const intentados = new Set<string>()

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Sin skip: cada cerrarCiclo exitoso saca a la suscripción del filtro.
      // Excluimos también los que ya fallaron en este run.
      const excluidos = Array.from(intentados)
      const query: Record<string, unknown> = {
        estado: 'activa',
        fechaVencimiento: { $lt: now },
        activo: true,
      }
      if (excluidos.length > 0) query._id = { $nin: excluidos }

      const lote = await Subscription.find(query)
        .limit(BATCH)
        .lean<ISubscription[]>()

      if (lote.length === 0) break

      for (const sub of lote) {
        intentados.add(String(sub._id))
        try {
          await this.cerrarCiclo(sub)
          procesadas++
        } catch {
          errores++
        }
      }
    }

    return { procesadas, errores }
  },

  // Soft delete
  async delete(id: string): Promise<void> {
    await dbConnect()
    await Subscription.findByIdAndUpdate(id, { activo: false })
  },
}
