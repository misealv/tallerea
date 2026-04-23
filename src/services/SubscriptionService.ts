import mongoose from 'mongoose'
import dbConnect from '@/lib/db'
import Subscription, { ISubscription } from '@/models/Subscription'
import Booking from '@/models/Booking'
import Workshop from '@/models/Workshop'
import Account from '@/models/Account'
import User from '@/models/User'
import PaymentBreakdown from '@/models/PaymentBreakdown'
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

  // [FINANCE RISK] Crea suscripción + PaymentBreakdown + preferencia MP
  async createWithPayment(
    workshopId: string,
    studentId: string,
    studentEmail: string
  ): Promise<CreateSubscriptionResult> {
    await dbConnect()

    const workshop = await Workshop.findOne({ _id: workshopId, activo: true })
    if (!workshop) throw new Error('Taller no encontrado')
    if (!workshop.plan) throw new Error('Este taller no tiene plan de suscripción')

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

    const monto = workshop.precio
    const sesiones = workshop.plan.sesionesIncluidas
    const vigencia = workshop.plan.vigencia
    const fechaCompra = new Date()
    const fechaVencimiento = calcularVencimiento(vigencia, fechaCompra)

    // Crear suscripción (pendiente de pago si no es gratis)
    const subscription = await new Subscription({
      workshopId,
      studentId,
      estado: 'activa',
      sesionesTotales: sesiones,
      sesionesUsadas: 0,
      sesionesDisponibles: sesiones,
      fechaCompra,
      fechaVencimiento,
      monto,
    }).save()

    // Taller gratuito → completar sin pago
    if (monto === 0) {
      return { subscription, free: true }
    }

    // [CUADRATURA] Calcular desglose financiero
    const account = await Account.findById(workshop.accountId)
    const feePct = await SiteConfigService.getComisionPct()
    const desglose = FinanceService.calcularDesglose(monto, feePct)

    // Crear PaymentBreakdown pendiente
    const breakdown = await new PaymentBreakdown({
      subscriptionId: subscription._id,
      workshopId,
      accountId: workshop.accountId,
      studentId,
      montoBruto: desglose.montoBruto,
      comisionMP: 0,
      feeTallerea: desglose.feeTallerea,
      montoProfesor: desglose.montoProfesor,
      porcentajeFee: feePct,
      precioModalidad: account?.precioModalidad ?? 'bruto',
      tipo: 'pago',
      estado: 'pendiente',
    }).save()

    // Vincular breakdown a suscripción
    subscription.paymentBreakdownId = breakdown._id as mongoose.Types.ObjectId
    await subscription.save()

    // Crear preferencia MercadoPago — prefijo 'sub:' identifica subscription
    const preference = await createPaymentPreference({
      externalRef: `sub:${String(subscription._id)}`,
      workshopTitle: workshop.titulo,
      amount: monto,
      payerEmail: studentEmail,
    })

    // Audit log
    await FinanceService.log(
      'pago_recibido',
      'PaymentBreakdown',
      String(breakdown._id),
      monto,
      studentId
    )

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

    return this.createWithPayment(
      String(prev.workshopId),
      String(prev.studentId),
      studentEmail
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

  // Consumir 1 sesión (llamado por BookingService)
  async consumeSesion(subscriptionId: string): Promise<ISubscription> {
    await dbConnect()
    const sub = await Subscription.findById(subscriptionId)
    if (!sub) throw new Error('Suscripción no encontrada')
    if (sub.estado !== 'activa') throw new Error('Suscripción no activa')
    if (sub.sesionesDisponibles <= 0) throw new Error('No quedan sesiones disponibles')
    if (sub.fechaVencimiento < new Date()) {
      sub.estado = 'vencida'
      await sub.save()
      throw new Error('Suscripción vencida')
    }

    sub.sesionesUsadas += 1
    sub.sesionesDisponibles -= 1
    await sub.save()
    return sub
  },

  // Devolver 1 sesión (cancelación de booking)
  async devolverSesion(subscriptionId: string): Promise<ISubscription> {
    await dbConnect()
    const sub = await Subscription.findById(subscriptionId)
    if (!sub) throw new Error('Suscripción no encontrada')

    sub.sesionesUsadas = Math.max(0, sub.sesionesUsadas - 1)
    sub.sesionesDisponibles += 1
    await sub.save()
    return sub
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

    // 1. Cancelar todas las bookings futuras en estado 'reservada' de esta suscripción
    await Booking.updateMany(
      {
        subscriptionId: sub._id,
        estado: 'reservada',
        fecha: { $gte: now },
        activo: true,
      },
      {
        $set: {
          estado: 'cancelada',
          canceladaEn: now,
          canceladaRazon: 'ciclo_vencido',
        },
      }
    )

    // 2. Marcar suscripción como vencida
    await Subscription.findByIdAndUpdate(sub._id, { estado: 'vencida' })

    // 3. Obtener datos del alumno y el taller para el email
    const [student, workshop] = await Promise.all([
      User.findById(sub.studentId).select('name email').lean<{ _id: mongoose.Types.ObjectId; name: string; email: string }>(),
      Workshop.findById(sub.workshopId).select('titulo slug').lean<{ _id: mongoose.Types.ObjectId; titulo: string; slug: string }>(),
    ])

    if (!student?.email || !workshop) return

    // 4. Enviar email según preferencia del alumno
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
