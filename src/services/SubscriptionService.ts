import 'server-only'
import mongoose from 'mongoose'
import dbConnect from '@/lib/db'
import Subscription, { ISubscription } from '@/models/Subscription'
import Booking from '@/models/Booking'
import Workshop from '@/models/Workshop'
import User, { IDependent } from '@/models/User'
import { FinanceService } from '@/services/FinanceService'
import { SiteConfigService } from '@/services/SiteConfigService'
import { createPaymentPreference } from '@/lib/mercadopago'
import { sendSubscriptionVencida, sendSubscriptionRenovar, sendPrepaidExhausted } from '@/lib/resend'

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
    dependentNombre?: string,
    dependentFechaNacimiento?: string,
    precioEspecialOverride?: { monto: number; nota?: string },
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

    // Upsert del dependiente en User.dependents[] si el apoderado inscribe a otro
    let resolvedDependentId: mongoose.Types.ObjectId | undefined
    let resolvedDependentSnapshot: string | undefined
    if (dependentNombre?.trim()) {
      const nombre = dependentNombre.trim()
      const parentUser = await User.findById(studentId).select('dependents')
      if (parentUser) {
        const existing = parentUser.dependents.find(
          (d: IDependent) => d.activo && d.nombre.toLowerCase() === nombre.toLowerCase()
        )
        if (existing) {
          resolvedDependentId = existing._id
          resolvedDependentSnapshot = existing.nombre
        } else {
          parentUser.dependents.push({
            nombre,
            fechaNacimiento: dependentFechaNacimiento ? new Date(dependentFechaNacimiento) : undefined,
            activo: true,
          })
          await parentUser.save()
          const added = parentUser.dependents[parentUser.dependents.length - 1]
          resolvedDependentId = added._id
          resolvedDependentSnapshot = added.nombre
        }
      }
    }

    // [FINANCE] Crear suscripción en estado 'pendiente_pago'.
    // El PaymentBreakdown NO se crea acá — se difiere a handleApprovedSubscription
    // cuando MercadoPago confirme el pago (Principio #10: nunca registrar dinero antes de confirmación).
    // [FINANCE RISK] Si hay precio especial override, usarlo en lugar del monto calculado
    if (precioEspecialOverride && precioEspecialOverride.monto >= 0) {
      monto = precioEspecialOverride.monto
    }
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
      // Dependiente (apoderado inscribiendo a hijo/a)
      ...(resolvedDependentId && {
        dependentId:             resolvedDependentId,
        dependentNombreSnapshot: resolvedDependentSnapshot,
      }),
      // Precio especial: marcar y guardar nota si viene del override
      ...(precioEspecialOverride && {
        precioEspecial:     true,
        notaPrecioEspecial: precioEspecialOverride.nota,
        precioSnapshot:     monto,
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

    // [FINANCE RISK] Si la sub anterior tenía precio especial, mantenerlo en la renovación
    const precioEspecialOverride = prev.precioEspecial && typeof prev.precioSnapshot === 'number'
      ? { monto: prev.precioSnapshot, nota: prev.notaPrecioEspecial }
      : undefined

    return this.createWithPayment(
      String(prev.workshopId),
      String(prev.studentId),
      studentEmail,
      paqueteIdPrev,
      undefined,
      undefined,
      precioEspecialOverride,
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

  /**
   * [FINANCE RISK] Actualización administrativa del precio especial y/o fecha de vencimiento.
   * Solo modifica campos que afectan la PRÓXIMA renovación o el ciclo actual.
   * NO crea PaymentBreakdown ni cobra/reembolsa de forma inmediata.
   */
  async adminUpdate(
    subscriptionId: string,
    data: {
      precioSnapshot?: number
      fechaVencimiento?: Date
      notaPrecioEspecial?: string
    }
  ): Promise<ISubscription> {
    await dbConnect()
    const sub = await Subscription.findById(subscriptionId)
    if (!sub) throw new Error('Suscripción no encontrada')

    if (data.precioSnapshot !== undefined) {
      if (!Number.isInteger(data.precioSnapshot) || data.precioSnapshot < 0) {
        throw new Error('[FINANCE] precioSnapshot debe ser entero CLP >= 0')
      }
      sub.precioSnapshot = data.precioSnapshot
      sub.precioEspecial = true
    }
    if (data.fechaVencimiento !== undefined) {
      sub.fechaVencimiento = data.fechaVencimiento
      // [PREPAGADO] Si la suscripción tiene paquete prepagado, caducaEn es la fuente de verdad
      // para el cron y el display. Mantener ambos campos sincronizados al editar la fecha desde
      // el modal "Editar suscripción" — evita que la edición quede inerte cuando hay prepago.
      if (sub.clasesPrepagadas && sub.clasesPrepagadas.cantidad > 0) {
        sub.clasesPrepagadas.caducaEn = data.fechaVencimiento
        sub.markModified('clasesPrepagadas')
      }
    }
    if (data.notaPrecioEspecial !== undefined) {
      sub.notaPrecioEspecial = data.notaPrecioEspecial
    }

    await sub.save()
    return sub.toObject()
  },

  /**
   * [PREPAGADO] Consume 1 clase del saldo prepagado de una Subscription manual.
   * - Atómico: $expr garantiza consumidas < cantidad antes de incrementar.
   * - Retorna null si la sub no tiene clasesPrepagadas o el saldo está agotado.
   * - NO crea PaymentBreakdown ni afecta liquidaciones.
   *
   * @param subscriptionId  ID de la Subscription
   * @param motivo          Estado terminal del Booking que dispara el consumo
   *                        (reservado para futuro audit log)
   */
  async consumePrepaid(
    subscriptionId: string,
    motivo: 'asistio' | 'no_show' | 'cancelacion_fuera_plazo'
  ): Promise<ISubscription | null> {
    await dbConnect()
    void motivo // [DEUDA] no se persiste todavía — pendiente audit log

    // Update atómico con guards: (a) saldo > 0  (b) no caducado
    // Sin caducaEn → siempre válido. Con caducaEn → solo si caducaEn > now.
    const now = new Date()
    const updated = await Subscription.findOneAndUpdate(
      {
        _id: subscriptionId,
        clasesPrepagadas: { $exists: true },
        $expr: { $lt: ['$clasesPrepagadas.consumidas', '$clasesPrepagadas.cantidad'] },
        $or: [
          { 'clasesPrepagadas.caducaEn': { $exists: false } },
          { 'clasesPrepagadas.caducaEn': null },
          { 'clasesPrepagadas.caducaEn': { $gt: now } },
        ],
      },
      { $inc: { 'clasesPrepagadas.consumidas': 1 } },
      { new: true }
    ).lean<ISubscription>()

    // [PREPAGADO] Si quedó agotado tras este consumo → notificar al alumno con link MP
    if (
      updated?.clasesPrepagadas &&
      updated.clasesPrepagadas.consumidas >= updated.clasesPrepagadas.cantidad
    ) {
      // Fire-and-forget: nunca bloquear el flujo de Booking si falla la notificación
      this.notifyPrepaidExhausted(String(updated._id)).catch((err) => {
        console.error('[PREPAGADO] notifyPrepaidExhausted failed', err)
      })
    }

    return updated // null si no tiene saldo prepagado activo
  },

  /**
   * [PREPAGADO] Genera un link MP con precioSnapshot y envía email al alumno.
   * Se invoca al detectar saldo agotado. NO bloquea el flujo si falla.
   */
  async notifyPrepaidExhausted(subscriptionId: string): Promise<void> {
    await dbConnect()

    const sub = await Subscription.findById(subscriptionId).lean<ISubscription>()
    if (!sub?.clasesPrepagadas) return
    if (!sub.precioSnapshot || sub.precioSnapshot <= 0) return // sin precio acordado

    const [student, workshop] = await Promise.all([
      User.findById(sub.studentId).select('name email').lean<{ name: string; email: string } | null>(),
      Workshop.findById(sub.workshopId).select('titulo').lean<{ titulo: string } | null>(),
    ])
    if (!student?.email || !workshop) return

    // Crear preferencia MP con precioSnapshot — externalRef sub:<id> ya conocido por el webhook
    const preference = await createPaymentPreference({
      externalRef: `sub:${subscriptionId}:prepaid-renewal`,
      workshopTitle: workshop.titulo,
      amount: sub.precioSnapshot,
      payerEmail: student.email,
    })

    if (!preference?.init_point) return

    await sendPrepaidExhausted({
      email: student.email,
      name: student.name || 'Alumno',
      workshopTitulo: workshop.titulo,
      initPoint: preference.init_point,
      monto: sub.precioSnapshot,
      cantidad: sub.clasesPrepagadas.cantidad,
    })
  },

  /**
   * [PREPAGADO] Verifica si una Subscription tiene saldo prepagado activo.
   * Retorna false si las clases ya caducaron (caducaEn < ahora).
   * Usado por el cron de renovación para omitir cobro automático.
   */
  hasPrepaidBalance(sub: ISubscription): boolean {
    if (!sub.clasesPrepagadas) return false
    if (sub.clasesPrepagadas.caducaEn && new Date() > sub.clasesPrepagadas.caducaEn) return false
    return sub.clasesPrepagadas.consumidas < sub.clasesPrepagadas.cantidad
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

    // [SYNC] Si la suscripción tiene saldo prepagado activo, sincronizar el contador
    // de consumidas. El panel del alumno y la inscripción manual usan este campo
    // como fuente de verdad, así que debe moverse junto con sesionesUsadas.
    await Subscription.updateOne(
      {
        _id: subscriptionId,
        'clasesPrepagadas.cantidad': { $gt: 0 },
        $expr: { $lt: ['$clasesPrepagadas.consumidas', '$clasesPrepagadas.cantidad'] },
        $or: [
          { 'clasesPrepagadas.caducaEn': { $exists: false } },
          { 'clasesPrepagadas.caducaEn': null },
          { 'clasesPrepagadas.caducaEn': { $gt: now } },
        ],
      },
      { $inc: { 'clasesPrepagadas.consumidas': 1 } }
    )

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

    // [SYNC] Mantener clasesPrepagadas.consumidas en sintona con sesionesUsadas
    await Subscription.updateOne(
      { _id: subscriptionId, 'clasesPrepagadas.consumidas': { $gt: 0 } },
      { $inc: { 'clasesPrepagadas.consumidas': -1 } }
    )

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

    // 5. Enviar email según preferencia del alumno.
    // [PREPAGADO] Si tiene precioSnapshot (precio acordado permanente), generar link MP
    // al mismo precio en lugar de enviar al precio público del taller.
    let renewalInitPoint: string | undefined
    if (sub.precioSnapshot && sub.precioSnapshot > 0) {
      try {
        // [IDEMPOTENCIA] Si ya existe una sub de renovación para este ciclo, reusarla.
        // Evita duplicación si cerrarCiclo se invoca 2× (cron retry o ejecución concurrente).
        const existente = await Subscription.findOne({
          renovadaDesdeId: sub._id,
          estado: { $in: ['pendiente_pago', 'activa'] },
          activo: true,
        })
        if (existente) {
          renewalInitPoint = existente.mpInitPoint
        } else {
        const clasesCantidad = sub.clasesPrepagadas?.cantidad ?? sub.sesionesTotales
        const caducaEn = sub.clasesPrepagadas?.caducaEn
        const nuevaCaducaEn = caducaEn
          ? (() => { const d = new Date(caducaEn); d.setMonth(d.getMonth() + 1); return d })()
          : undefined
        // [PREPAGADO] Primero crear la sub pendiente_pago; si save falla no se
        // crea preference fantasma en MP.
        const nuevaSub = await new Subscription({
          workshopId: sub.workshopId,
          studentId: sub.studentId,
          estado: 'pendiente_pago',
          sesionesTotales: clasesCantidad,
          sesionesUsadas: 0,
          sesionesDisponibles: clasesCantidad,
          fechaCompra: now,
          fechaVencimiento: nuevaCaducaEn ?? (() => { const d = new Date(now); d.setFullYear(d.getFullYear() + 1); return d })(),
          monto: sub.precioSnapshot,
          autoRenovar: false,
          precioEspecial: true,
          precioSnapshot: sub.precioSnapshot,
          notaPrecioEspecial: sub.notaPrecioEspecial,
          origenInscripcion: 'manual',
          inscritoPor: sub.inscritoPor,
          renovadaDesdeId: sub._id,
          ...(sub.dependentId ? { dependentId: sub.dependentId, dependentNombreSnapshot: sub.dependentNombreSnapshot } : {}),
          clasesPrepagadas: {
            cantidad: clasesCantidad,
            consumidas: 0,
            creadoPor: sub.inscritoPor ?? sub.studentId,
            ...(nuevaCaducaEn ? { caducaEn: nuevaCaducaEn } : {}),
          },
          activo: true,
        }).save()
        const pref = await createPaymentPreference({
          externalRef: `sub:${String(nuevaSub._id)}`,
          workshopTitle: `${workshop.titulo}${sub.dependentNombreSnapshot ? ` — ${sub.dependentNombreSnapshot}` : ''}`,
          amount: sub.precioSnapshot,
          payerEmail: student.email,
        })
        if (pref?.init_point) {
          renewalInitPoint = pref.init_point
          // [PAGO PENDIENTE] Cachear initPoint en la nueva sub
          await Subscription.updateOne(
            { _id: nuevaSub._id },
            { $set: { mpInitPoint: pref.init_point, mpInitPointCreatedAt: new Date() } }
          )
        }
        }
      } catch {
        // No bloquear cerrarCiclo si falla la generación del link de renovación
      }
    }

    if (sub.autoRenovar) {
      await sendSubscriptionRenovar({
        email: student.email,
        name: student.name,
        workshopTitulo: workshop.titulo,
        workshopSlug: workshop.slug,
        initPoint: renewalInitPoint,
        precioAcordado: renewalInitPoint ? sub.precioSnapshot : undefined,
        clasesCantidad: sub.clasesPrepagadas?.cantidad,
      }).catch(() => null)
    } else {
      await sendSubscriptionVencida({
        email: student.email,
        name: student.name,
        workshopTitulo: workshop.titulo,
        workshopSlug: workshop.slug,
        initPoint: renewalInitPoint,
        precioAcordado: renewalInitPoint ? sub.precioSnapshot : undefined,
        clasesCantidad: sub.clasesPrepagadas?.cantidad,
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
        // [PREPAGADO] Omitir suscripciones con saldo prepagado VIVO (no consumido y no caducado).
        // Si caducó el saldo, debe entrar al ciclo de renovación normal.
        $nor: [
          {
            $and: [
              { $expr: { $lt: ['$clasesPrepagadas.consumidas', '$clasesPrepagadas.cantidad'] } },
              {
                $or: [
                  { 'clasesPrepagadas.caducaEn': { $exists: false } },
                  { 'clasesPrepagadas.caducaEn': null },
                  { 'clasesPrepagadas.caducaEn': { $gt: now } },
                ],
              },
            ],
          },
        ],
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

  /**
   * Inscripción manual de un alumno por parte del tallerista (taller recurrente).
   * - Encuentra o crea el User por email.
   * - Opcionalmente agrega/usa un dependiente.
   * - Crea Subscription en estado 'activa', sin PaymentBreakdown.
   * - [FINANCE RISK] NO genera PaymentBreakdown ni modifica liquidaciones.
   * - Envía magic link al email del titular (sin opt-out).
   */
  async createManual(input: {
    ownerId: string
    workshopId: string
    studentEmail: string
    studentNombre: string
    dependentNombre?: string
    dependentFechaNacimiento?: Date
    dependentNotas?: string
    precioEspecial: boolean
    precioSnapshot?: number
    notaPrecioEspecial?: string
    clasesPrepagadas?: {
      cantidad: number
      consumidasAlInscribir?: number  // clases ya consumidas fuera del sistema al momento de inscribir
      fechaPago: Date
      metodoPago: string
      montoDeclarado?: number
      notaTallerista?: string
      caducaEn?: Date  // opcional: fecha límite de validez de las clases prepagadas
    }
    notaTallerista?: string
    isAdmin?: boolean
  }): Promise<ISubscription> {
    await dbConnect()

    // Validar workshop y ownership (admin puede inscribir en cualquier taller)
    const workshop = await Workshop.findOne({ _id: input.workshopId, activo: true })
    if (!workshop) throw new Error('Taller no encontrado')
    const ownerIdStr = String(workshop.ownerId ?? workshop.accountId ?? '')
    if (!input.isAdmin && ownerIdStr !== input.ownerId) {
      throw new Error('No tienes permiso sobre este taller')
    }
    if (workshop.modeloAcceso !== 'recurrente') {
      throw new Error('createManual de Subscription es solo para talleres recurrentes. Usa EnrollmentService.createManual para puntuales.')
    }

    // Precio especial requiere snapshot
    if (input.precioEspecial && (input.precioSnapshot == null || input.precioSnapshot < 0)) {
      throw new Error('[FINANCE RISK] precioSnapshot es obligatorio cuando precioEspecial=true')
    }
    if (input.precioSnapshot != null && !Number.isInteger(input.precioSnapshot)) {
      throw new Error('[FINANCE RISK] precioSnapshot debe ser un entero (CLP)')
    }

    // Clases prepagadas: requiere origenInscripcion='manual' — se valida en pre-save
    if (input.clasesPrepagadas) {
      if (!Number.isInteger(input.clasesPrepagadas.cantidad) || input.clasesPrepagadas.cantidad < 1) {
        throw new Error('[PREPAGADO] cantidad debe ser entero positivo')
      }
      if (input.clasesPrepagadas.montoDeclarado != null && !Number.isInteger(input.clasesPrepagadas.montoDeclarado)) {
        throw new Error('[FINANCE RISK] montoDeclarado debe ser entero (CLP)')
      }
    }

    // Encontrar o crear User titular
    const emailNorm = input.studentEmail.toLowerCase().trim()
    let studentUser = await User.findOne({ email: emailNorm })
    const isNewUser = !studentUser
    if (!studentUser) {
      studentUser = await new User({
        name: input.studentNombre.trim(),
        email: emailNorm,
        role: 'user',
        activo: true,
        dependents: [],
        creditoDisponible: 0,
      }).save()
    }
    const studentId = String(studentUser._id)

    // Manejar dependiente
    let dependentId: string | undefined
    let dependentNombreSnapshot: string | undefined
    if (input.dependentNombre?.trim()) {
      const nombre = input.dependentNombre.trim()
      const existing = studentUser.dependents.find(
        (d: IDependent) => d.activo && d.nombre.toLowerCase() === nombre.toLowerCase()
      )
      if (existing) {
        dependentId = String(existing._id)
        dependentNombreSnapshot = existing.nombre
      } else {
        const { Types } = await import('mongoose')
        studentUser.dependents.push({
          _id: new Types.ObjectId(),
          nombre,
          fechaNacimiento: input.dependentFechaNacimiento,
          notas: input.dependentNotas?.trim(),
          activo: true,
          createdAt: new Date(),
        })
        await studentUser.save()
        const added = studentUser.dependents[studentUser.dependents.length - 1]
        dependentId = String(added._id)
        dependentNombreSnapshot = added.nombre
      }
    }

    // Verificar duplicado: suscripción activa para mismo taller+titular+dependiente
    const dupFilter: Record<string, unknown> = {
      workshopId: input.workshopId,
      studentId,
      estado: 'activa',
      activo: true,
    }
    if (dependentId) dupFilter.dependentId = dependentId
    else dupFilter.dependentId = { $exists: false }
    const dup = await Subscription.findOne(dupFilter)
    if (dup) throw new Error('El alumno ya tiene una suscripción activa en este taller')

    // Calcular vencimiento y sesiones desde plan (si hay clasesPrepagadas, sesiones = cantidad)
    const ahora = new Date()
    let fechaVencimiento: Date
    let sesionesTotales: number
    let sesionesDisponibles: number

    if (input.clasesPrepagadas) {
      // Taller prepagado: las sesiones vienen del paquete.
      // [CICLO] Si hay caducaEn, ESA es la fecha real de vencimiento.
      // Sin esto el cron vencer-suscripciones nunca dispara el email de
      // vencida/renovar y la sub queda zombi en 'activa' durante 1 año.
      const yaConsumidas = input.clasesPrepagadas.consumidasAlInscribir ?? 0
      sesionesTotales = input.clasesPrepagadas.cantidad
      sesionesDisponibles = input.clasesPrepagadas.cantidad - yaConsumidas
      if (input.clasesPrepagadas.caducaEn) {
        fechaVencimiento = input.clasesPrepagadas.caducaEn
      } else {
        fechaVencimiento = new Date(ahora)
        fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + 1)
      }
    } else if (workshop.plan) {
      sesionesTotales = workshop.plan.sesionesIncluidas
      sesionesDisponibles = workshop.plan.sesionesIncluidas
      fechaVencimiento = calcularVencimiento(workshop.plan.vigencia, ahora)
    } else {
      // Taller recurrente sin plan ni prepagado: sesión infinita técnica
      sesionesTotales = 999
      sesionesDisponibles = 999
      fechaVencimiento = new Date(ahora)
      fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + 1)
    }

    const montoFinal = input.precioEspecial
      ? (input.precioSnapshot ?? 0)
      : (workshop.precioFijo?.monto ?? workshop.precio ?? 0)

    // Construir clasesPrepagadas doc
    const clasesPrepagadasDoc = input.clasesPrepagadas ? {
      cantidad: input.clasesPrepagadas.cantidad,
      consumidas: input.clasesPrepagadas.consumidasAlInscribir ?? 0,
      fechaPago: input.clasesPrepagadas.fechaPago,
      metodoPago: input.clasesPrepagadas.metodoPago,
      montoDeclarado: input.clasesPrepagadas.montoDeclarado,
      notaTallerista: input.clasesPrepagadas.notaTallerista?.trim(),
      creadoPor: new mongoose.Types.ObjectId(input.ownerId),
      ...(input.clasesPrepagadas.caducaEn ? { caducaEn: input.clasesPrepagadas.caducaEn } : {}),
    } : undefined

    const subscription = await new Subscription({
      workshopId: input.workshopId,
      studentId,
      estado: 'activa',
      sesionesTotales,
      sesionesUsadas: 0,
      sesionesDisponibles,
      fechaCompra: ahora,
      fechaVencimiento,
      // [FINANCE RISK] pagoRef intencionalmente omitido en inscripciones manuales:
      // el índice unique sparse sobre pagoRef solo indexa valores no-nulos.
      // origenInscripcion:'manual' identifica el origen; no hace falta pagoRef='manual'
      // (usarlo causaría E11000 al crear una segunda inscripción manual).
      monto: montoFinal,
      autoRenovar: false,
      precioSnapshot: input.precioEspecial ? input.precioSnapshot : undefined,
      origenInscripcion: 'manual',
      inscritoPor: input.ownerId,
      precioEspecial: input.precioEspecial,
      notaPrecioEspecial: input.notaPrecioEspecial?.trim(),
      notaTallerista: input.notaTallerista?.trim(),
      ...(dependentId ? { dependentId, dependentNombreSnapshot } : {}),
      ...(clasesPrepagadasDoc ? { clasesPrepagadas: clasesPrepagadasDoc } : {}),
      activo: true,
    }).save()

    // Emitir magic link (fire-and-forget si falla)
    if (isNewUser || !studentUser.password) {
      try {
        const { issueMagicLink } = await import('@/lib/issueMagicLink')
        const { sendMagicLink } = await import('@/lib/resend')
        const { magicUrl } = await issueMagicLink(studentId)
        await sendMagicLink({ email: emailNorm, magicUrl })
      } catch {
        // No bloquear la inscripción por fallo de email
      }
    }

    return subscription.toObject() as ISubscription
  },

  /**
   * [LINK PAGO] Crea una suscripción en estado 'pendiente_pago' con clasesPrepagadas
   * y precio especial ya configurados, luego genera una preferencia MercadoPago.
   * El webhook handleApprovedSubscription la activa sin cambios adicionales.
   *
   * Caso de uso: tallerista acuerda precio fuera del sistema, quiere que el alumno
   * pague online por el monto exacto acordado y las clases se activen al confirmar.
   */
  async createManualPendingPayment(input: {
    workshopId: string
    ownerId: string
    studentEmail: string
    studentNombre: string
    dependentNombre: string
    dependentFechaNacimiento?: string
    precioAcordado: number           // CLP enteros — precio que pagará el alumno
    notaPrecio?: string
    clasesCantidad: number           // clases que se activarán al pagar
    caducaEn?: Date                  // opcional: fecha límite de validez
  }): Promise<{ initPoint: string; subscriptionId: string }> {
    await dbConnect()

    if (!Number.isInteger(input.precioAcordado) || input.precioAcordado <= 0)
      throw new Error('[FINANCE] precioAcordado debe ser entero CLP positivo')
    if (!Number.isInteger(input.clasesCantidad) || input.clasesCantidad < 1)
      throw new Error('[PREPAGADO] clasesCantidad debe ser entero >= 1')

    const workshop = await Workshop.findOne({ _id: input.workshopId, activo: true })
    if (!workshop) throw new Error('Taller no encontrado')

    // [PAGO PENDIENTE] Solo talleres recurrentes pueden generar suscripciones
    if (workshop.modeloAcceso !== 'recurrente')
      throw new Error('Solo talleres recurrentes admiten link de pago de suscripción')

    const ownerIdStr = String(workshop.ownerId ?? workshop.accountId ?? '')
    if (ownerIdStr !== input.ownerId) throw new Error('Sin permiso sobre este taller')

    // [PAGO PENDIENTE] Validar email del alumno (MP rechaza preferencia sin payer email)
    const emailNorm = input.studentEmail.trim().toLowerCase()
    if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm))
      throw new Error('Email del alumno inválido')

    // Upsert alumno
    const { findOrCreateGuestUser } = await import('@/lib/guestUser')
    const { userId: studentId } = await findOrCreateGuestUser(input.studentNombre.trim(), emailNorm)

    // Upsert dependiente
    const parentUser = await User.findById(studentId).select('dependents')
    let dependentId: mongoose.Types.ObjectId | undefined
    let dependentNombreSnapshot: string | undefined
    if (parentUser) {
      const nombre = input.dependentNombre.trim()
      const existing = parentUser.dependents?.find(
        (d: IDependent) => d.activo && d.nombre.toLowerCase() === nombre.toLowerCase()
      )
      if (existing) {
        dependentId = existing._id
        dependentNombreSnapshot = existing.nombre
      } else {
        parentUser.dependents = parentUser.dependents ?? []
        parentUser.dependents.push({
          nombre,
          fechaNacimiento: input.dependentFechaNacimiento ? new Date(input.dependentFechaNacimiento) : undefined,
          activo: true,
        })
        await parentUser.save()
        const added = parentUser.dependents[parentUser.dependents.length - 1]
        dependentId = added._id
        dependentNombreSnapshot = added.nombre
      }
    }

    // Verificar que no haya sub activa o pendiente para este dependiente en este taller
    const dupFilter: Record<string, unknown> = {
      workshopId: input.workshopId,
      studentId,
      estado: { $in: ['activa', 'pendiente_pago'] },
    }
    if (dependentId) dupFilter.dependentId = dependentId
    const dup = await Subscription.findOne(dupFilter)
    if (dup) throw new Error(
      dup.estado === 'pendiente_pago'
        ? 'Ya existe un link de pago pendiente para este menor'
        : 'El menor ya tiene una suscripción activa'
    )

    const ahora = new Date()
    const fechaVencimiento = input.caducaEn
      ? new Date(input.caducaEn)
      : (() => { const d = new Date(ahora); d.setFullYear(d.getFullYear() + 1); return d })()

    const subscription = await new Subscription({
      workshopId: input.workshopId,
      studentId,
      estado: 'pendiente_pago',
      sesionesTotales: input.clasesCantidad,
      sesionesUsadas: 0,
      sesionesDisponibles: input.clasesCantidad,
      fechaCompra: ahora,
      fechaVencimiento,
      monto: input.precioAcordado,
      autoRenovar: false,
      precioEspecial: true,
      precioSnapshot: input.precioAcordado,
      notaPrecioEspecial: input.notaPrecio?.trim(),
      origenInscripcion: 'manual',
      inscritoPor: new mongoose.Types.ObjectId(input.ownerId),
      ...(dependentId ? { dependentId, dependentNombreSnapshot } : {}),
      clasesPrepagadas: {
        cantidad: input.clasesCantidad,
        consumidas: 0,
        // fechaPago y metodoPago se completarán al confirmar el webhook
        creadoPor: new mongoose.Types.ObjectId(input.ownerId),
        ...(input.caducaEn ? { caducaEn: new Date(input.caducaEn) } : {}),
      },
      activo: true,
    }).save()

    const preference = await createPaymentPreference({
      externalRef: `sub:${String(subscription._id)}`,
      workshopTitle: `${workshop.titulo} — ${dependentNombreSnapshot ?? input.dependentNombre.trim()}`,
      amount: input.precioAcordado,
      payerEmail: emailNorm,
    })

    const initPoint = preference.init_point ?? ''
    // [PAGO PENDIENTE] Cachear initPoint en la sub para que el banner alumno lo reuse
    if (initPoint) {
      subscription.mpInitPoint = initPoint
      subscription.mpInitPointCreatedAt = new Date()
      await subscription.save()
    }

    return {
      initPoint,
      subscriptionId: String(subscription._id),
    }
  },

  /**
   * Tallerista edita el paquete de una sub (cantidad de clases, precio, caducidad).
   * Usado para que el cron de renovación sepa cuánto cobrar y por cuántas clases.
   *
   * Reglas:
   * - Ownership: workshop.ownerId === ownerId
   * - No permite reducir `cantidad` por debajo de `sesionesUsadas`
   * - Sincroniza sesionesTotales / sesionesDisponibles cuando cambia cantidad
   * - Si cambia precio: invalida cache de mpInitPoint (link MP viejo apunta al precio anterior)
   */
  async updatePaquete(input: {
    subscriptionId: string
    ownerId: string
    cantidad?: number
    precio?: number              // CLP enteros — actualiza precioSnapshot y monto
    caducaEn?: Date | null
    notaPrecio?: string | null
    autoRenovar?: boolean
  }): Promise<ISubscription> {
    await dbConnect()

    const sub = await Subscription.findById(input.subscriptionId)
    if (!sub) throw new Error('Suscripción no encontrada')

    const workshop = await Workshop.findById(sub.workshopId)
    if (!workshop) throw new Error('Taller no encontrado')
    const ownerIdStr = String(workshop.ownerId ?? workshop.accountId ?? '')
    if (ownerIdStr !== input.ownerId) throw new Error('Sin permiso sobre esta suscripción')

    let precioChanged = false

    // Cantidad de clases del paquete
    if (input.cantidad !== undefined) {
      if (!Number.isInteger(input.cantidad) || input.cantidad < 1)
        throw new Error('Cantidad debe ser entero >= 1')
      if (input.cantidad < sub.sesionesUsadas)
        throw new Error(`No puedes reducir el paquete a ${input.cantidad}: el alumno ya consumió ${sub.sesionesUsadas} clases`)

      const delta = input.cantidad - sub.sesionesTotales
      sub.sesionesTotales = input.cantidad
      sub.sesionesDisponibles = Math.max(0, sub.sesionesDisponibles + delta)
      if (!sub.clasesPrepagadas) {
        sub.clasesPrepagadas = {
          cantidad: input.cantidad,
          consumidas: sub.sesionesUsadas,
          creadoPor: sub.inscritoPor ?? sub.studentId,
        } as ISubscription['clasesPrepagadas']
      } else {
        sub.clasesPrepagadas.cantidad = input.cantidad
      }
    }

    // Precio (afecta tanto al cobro mensual como al snapshot que usa cerrarCiclo)
    if (input.precio !== undefined) {
      if (!Number.isInteger(input.precio) || input.precio <= 0)
        throw new Error('[FINANCE] precio debe ser entero CLP positivo')
      if (sub.monto !== input.precio || sub.precioSnapshot !== input.precio) {
        sub.monto = input.precio
        sub.precioSnapshot = input.precio
        sub.precioEspecial = true
        precioChanged = true
      }
    }

    // Caducidad del ciclo (cuándo cobrar de nuevo)
    if (input.caducaEn !== undefined) {
      if (input.caducaEn === null) {
        if (sub.clasesPrepagadas) sub.clasesPrepagadas.caducaEn = undefined
      } else {
        const d = new Date(input.caducaEn)
        if (isNaN(d.getTime())) throw new Error('Fecha de caducidad inválida')
        if (!sub.clasesPrepagadas) {
          sub.clasesPrepagadas = {
            cantidad: sub.sesionesTotales,
            consumidas: sub.sesionesUsadas,
            creadoPor: sub.inscritoPor ?? sub.studentId,
            caducaEn: d,
          } as ISubscription['clasesPrepagadas']
        } else {
          sub.clasesPrepagadas.caducaEn = d
        }
        sub.fechaVencimiento = d
      }
    }

    if (input.notaPrecio !== undefined) {
      sub.notaPrecioEspecial = input.notaPrecio?.trim() || undefined
    }

    if (input.autoRenovar !== undefined) {
      sub.autoRenovar = input.autoRenovar
    }

    // [PAGO PENDIENTE] Si cambió el precio, el initPoint cacheado apunta al monto viejo
    if (precioChanged) {
      sub.mpInitPoint = undefined
      sub.mpInitPointCreatedAt = undefined
    }

    await sub.save()
    return sub.toObject() as ISubscription
  },
}
