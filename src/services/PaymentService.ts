import dbConnect from '@/lib/db'
import mongoose from 'mongoose'
import { EnrollmentService } from '@/services/EnrollmentService'
import { WorkshopService } from '@/services/WorkshopService'
import { FinanceService } from '@/services/FinanceService'
import { createPaymentPreference } from '@/lib/mercadopago'
import { sendEnrollmentConfirmation, sendClasePruebaProfesor } from '@/lib/resend'
import PaymentBreakdown from '@/models/PaymentBreakdown'
import Enrollment from '@/models/Enrollment'
import User from '@/models/User'
import Subscription from '@/models/Subscription'
import type { ISubscription } from '@/models/Subscription'
import Workshop from '@/models/Workshop'
import { SiteConfigService } from '@/services/SiteConfigService'

interface CreatePaymentResult {
  free?: boolean
  enrollmentId: string
  preferenceId?: string | null
  initPoint?: string | null
}

export const PaymentService = {

  // Crea inscripción + preferencia de pago (o marca pagado si es gratis / cubierto 100% por crédito)
  async createEnrollmentWithPayment(
    workshopId: string,
    studentId: string,
    studentName: string,
    studentEmail: string,
    slotIndex?: number | null,
    usarCredito = false,
    montoVoluntario?: number,   // solo si workshop.modalidadPrecio === 'voluntario'
    esClasePrueba = false,
    dependentNombre?: string,
    dependentFechaNacimiento?: string,
    slotFecha?: string,         // YYYY-MM-DD concreto elegido en SlotCalendarPicker
  ): Promise<CreatePaymentResult> {
    const workshop = await WorkshopService.getById(workshopId)
    if (!workshop) throw new Error('Taller no encontrado')

    // [FINANCE RISK] Determinar monto según modalidad
    let montoBase: number
    const mp = workshop.modalidadPrecio ?? 'fijo'

    if (mp === 'voluntario') {
      const av = workshop.aporteVoluntario
      if (montoVoluntario === undefined || montoVoluntario === null) {
        montoBase = av?.sugerido ?? 0
      } else {
        // Clamp al rango [minimo, maximo]
        const min = av?.minimo ?? 0
        const max = av?.maximo ?? Infinity
        montoBase = Math.min(Math.max(Math.round(montoVoluntario), min), max === Infinity ? montoVoluntario : max)
      }
    } else if (esClasePrueba && workshop.clasePrueba?.habilitada) {
      montoBase = workshop.clasePrueba.precio ?? 0
    } else if (mp === 'gratuito') {
      montoBase = 0
    } else if (mp === 'fijo') {
      const precioBase = workshop.precioFijo?.monto ?? workshop.precio ?? 0
      // [FINANCE RISK] Si precioModalidad es 'neto', el precio guardado es lo que recibe el profesor.
      // Convertir a precio bruto (lo que paga el alumno) antes de cobrar.
      if (workshop.precioModalidad === 'neto' && precioBase > 0) {
        const comisionPct = await SiteConfigService.getComisionPct()
        montoBase = FinanceService.calcularPrecioDesdeNeto(precioBase, comisionPct)
      } else {
        montoBase = precioBase
      }
    } else {
      // paquetes no pasan por aquí (van por SubscriptionService), fallo explícito
      throw new Error('Talleres con paquetes deben usar el flujo de suscripción')
    }

    // Si es clase de prueba, usar reservarPrueba en lugar de create
    let enrollment
    if (esClasePrueba) {
      enrollment = await EnrollmentService.reservarPrueba(workshopId, studentId, slotIndex ?? null, slotFecha, dependentNombre, dependentFechaNacimiento)
    } else {
      // Crear enrollment pendiente. Si usarCredito=true, EnrollmentService.create descuenta crédito
      enrollment = await EnrollmentService.create({
        workshopId,
        studentId,
        monto: montoBase,
        slotIndex: slotIndex ?? null,
        usarCredito,
        dependentNombre,
        dependentFechaNacimiento,
      })
    }

    const enrollmentId = String(enrollment._id)
    const creditoAplicado = enrollment.creditoAplicado ?? 0
    // [FINANCE RISK] montoACobrar = monto real a cobrar por MP; crédito sale del margen de Tallerea
    const montoACobrar = Math.max(0, montoBase - creditoAplicado)

    // Guardar montoPagadoVoluntario si aplica
    if (mp === 'voluntario' && montoBase !== undefined) {
      await EnrollmentService.update(enrollmentId, { montoPagadoVoluntario: montoBase } as Parameters<typeof EnrollmentService.update>[1])
    }

    // Taller gratuito o crédito cubre 100%: marcar pagado directamente, sin preference MP
    if (montoBase === 0 || montoACobrar === 0) {
      await EnrollmentService.update(enrollmentId, { estado: 'pagado' })

      // [CUADRATURA] Si el monto no es 0 (había precio pero crédito lo cubrió),
      // crear PaymentBreakdown para que el profesor cobre su parte en la liquidación
      if (montoBase > 0) {
        await this._createBreakdownForEnrollment(enrollmentId, null)
      }

      try {
        await sendEnrollmentConfirmation({
          studentName,
          studentEmail,
          workshopTitle: workshop.titulo,
          workshopSlug: workshop.slug,
          monto: montoBase,
        })
      } catch {
        // No bloquear inscripción por fallo de email
      }

      return { free: true, enrollmentId }
    }

    // Crear preferencia de pago en MercadoPago por el monto restante tras aplicar crédito
    const preference = await createPaymentPreference({
      externalRef: `enr:${enrollmentId}`,
      workshopTitle: workshop.titulo,
      amount: montoACobrar,
      payerEmail: studentEmail,
      payerName: studentName,
    })

    return {
      enrollmentId,
      preferenceId: preference.id,
      initPoint: preference.init_point,
    }
  },

  // [FINANCE RISK][CUADRATURA] Helper privado: crea PaymentBreakdown para un enrollment pagado.
  // paymentId = null cuando el pago se cubrió 100% con crédito (sin transacción MP).
  // [IDEMPOTENCIA] Si ya existe breakdown con ese mercadoPagoId, no duplica (E11000 capturado).
  async _createBreakdownForEnrollment(enrollmentId: string, paymentId: string | null): Promise<void> {
    const enrollment = await EnrollmentService.getById(enrollmentId)
    if (!enrollment) return

    // [IDEMPOTENCIA] Si ya hay breakdown con este mercadoPagoId, salir
    if (paymentId) {
      const existing = await PaymentBreakdown.findOne({ mercadoPagoId: String(paymentId) }).lean()
      if (existing) return
    }

    const workshop = enrollment.workshopId as unknown as {
      _id: string; titulo: string; slug: string; ownerId: string; precio: number; precioModalidad: string
    }

    const feePct = await SiteConfigService.getComisionPct()
    // montoBruto = precio completo (lo que debe cobrar el profesor).
    // El crédito aplicado sale del margen de Tallerea, no descuenta al profesor.
    const desglose = FinanceService.calcularDesglose(enrollment.monto, feePct)

    let breakdown
    try {
      breakdown = await new PaymentBreakdown({
        enrollmentId,
        workshopId:      workshop._id,
        ownerId:         workshop.ownerId,
        studentId:       enrollment.studentId,
        montoBruto:      desglose.montoBruto,
        comisionMP:      0,
        feeTallerea:     desglose.feeTallerea,
        montoProfesor:   desglose.montoProfesor,
        creditoAplicado: enrollment.creditoAplicado ?? 0,
        porcentajeFee:   feePct,
        precioModalidad: workshop.precioModalidad ?? 'bruto',
        tipo:            'pago',
        estado:          'cobrado',
        mercadoPagoId:   paymentId ?? undefined,
        fechaCobro:      new Date(),
      }).save()
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code
      if (code === 11000) return // race con webhook simultáneo, ya existe
      throw err
    }

    try {
      await FinanceService.log(
        'pago_recibido',
        'PaymentBreakdown',
        String(breakdown._id),
        enrollment.monto,
        String(enrollment.studentId)
      )
    } catch {
      // No bloquear flujo por fallo de audit
    }
  },

  // [FINANCE RISK] Procesa pago aprobado: crea PaymentBreakdown + actualiza enrollment + email
  // [IDEMPOTENCIA] Si ya está pagado con el mismo paymentId, retorna sin reprocesar.
  async handleApprovedPayment(enrollmentId: string, paymentId: string): Promise<{ magicUrl?: string }> {
    await dbConnect()

    // [IDEMPOTENCIA] Verificar estado actual antes de mutar
    const current = await EnrollmentService.getById(enrollmentId)
    if (!current) return {}
    // Si ya fue procesado exactamente con este paymentId → idempotente
    if (current.estado === 'pagado' && current.pagoRef === String(paymentId)) return {}
    // [IDEMPOTENCIA] Guard por mercadoPagoId único en breakdown
    const existingBreakdown = await PaymentBreakdown.findOne({ mercadoPagoId: String(paymentId) }).lean<{ _id: mongoose.Types.ObjectId }>()
    if (existingBreakdown && current.estado === 'pagado') return {}

    // Pre-calcular desglose fuera de la transacción (no requiere DB write)
    const workshopForBreakdown = current.workshopId as unknown as {
      _id: string; titulo: string; slug: string; ownerId: string; precio: number; precioModalidad: string
    }
    const feePct = await SiteConfigService.getComisionPct()
    const desglose = FinanceService.calcularDesglose(current.monto, feePct)

    // Escrituras atómicas: enrollment + breakdown + audit log en la misma transacción
    const session = await mongoose.startSession()
    let createdBreakdownId: string | undefined
    try {
      await session.withTransaction(async () => {
        // Marcar enrollment como pagado
        await Enrollment.updateOne(
          { _id: enrollmentId },
          { estado: 'pagado', pagoRef: String(paymentId) },
          { session }
        )

        // [IDEMPOTENCIA] Solo crear breakdown si no existe (E11000 = ya existe, continuar)
        if (!existingBreakdown) {
          const [breakdown] = await PaymentBreakdown.create([{
            enrollmentId,
            workshopId:      workshopForBreakdown._id,
            ownerId:         workshopForBreakdown.ownerId,
            studentId:       current.studentId,
            montoBruto:      desglose.montoBruto,
            comisionMP:      0,
            feeTallerea:     desglose.feeTallerea,
            montoProfesor:   desglose.montoProfesor,
            creditoAplicado: current.creditoAplicado ?? 0,
            porcentajeFee:   feePct,
            precioModalidad: workshopForBreakdown.precioModalidad ?? 'bruto',
            tipo:            'pago',
            estado:          'cobrado',
            mercadoPagoId:   String(paymentId),
            fechaCobro:      new Date(),
          }], { session })
          createdBreakdownId = String(breakdown._id)

          await FinanceService.logWithSession(
            session,
            'pago_recibido',
            'PaymentBreakdown',
            createdBreakdownId,
            current.monto,
            String(current.studentId)
          )
        }
      })
    } finally {
      await session.endSession()
    }

    const enrollment = await EnrollmentService.getById(enrollmentId)
    if (!enrollment) return {}

    const workshop = enrollment.workshopId as unknown as {
      _id: string; titulo: string; slug: string; ownerId: string; precio: number
    }

    // Resolver detalles del slot reservado (para clase de prueba o slot puntual)
    let slotFecha: string | undefined
    let slotHora: string | undefined
    let direccion: string | undefined
    let profesorNombre: string | undefined
    let profesorEmail: string | undefined

    try {
      const workshopFull = await Workshop.findById(workshop._id)
        .populate<{ ownerId: { _id: string; name: string; email: string } }>('ownerId', 'name email')
        .populate<{ locationId: { nombre: string; direccion: string; comuna: string } }>('locationId', 'nombre direccion comuna')
        .lean() as {
          slots?: Array<{ dia?: string; fecha?: Date; horaInicio: string; horaFin: string }>
          ownerId?: { _id: string; name: string; email: string }
          locationId?: { nombre?: string; direccion?: string; comuna?: string }
        } | null

      if (workshopFull) {
        // Slot reservado
        const slotIdx = enrollment.slotIndex
        const slot = (slotIdx != null && workshopFull.slots?.[slotIdx]) ? workshopFull.slots[slotIdx] : null
        if (slot) {
          if (slot.fecha) {
            // slot.fecha es UTC midnight → usar timeZone:'UTC' para no retroceder un día al convertir a America/Santiago
            slotFecha = new Intl.DateTimeFormat('es-CL', {
              weekday: 'long', day: 'numeric', month: 'long',
              timeZone: 'UTC',
            }).format(new Date(slot.fecha))
          } else if (slot.dia) {
            slotFecha = slot.dia
          }
          slotHora = `${slot.horaInicio} - ${slot.horaFin}`
        }

        // Profesor
        if (workshopFull.ownerId) {
          profesorNombre = workshopFull.ownerId.name
          profesorEmail = workshopFull.ownerId.email
        }

        // Dirección
        const loc = workshopFull.locationId
        if (loc?.direccion) {
          direccion = [loc.nombre, loc.direccion, loc.comuna].filter(Boolean).join(', ')
        }
      }
    } catch {
      // No bloquear por fallo de resolución de detalles
    }

    // Enviar email de confirmación (try/catch independiente)
    try {
      const student = enrollment.studentId as unknown as { _id: string; name: string; email: string }

      // No se incluye magic link en el email de confirmación — se muestra solo en la página de éxito.
      // Esto evita que el enlace del email quede inválido por race condition con la página.
      await sendEnrollmentConfirmation({
        studentName: student.name,
        studentEmail: student.email,
        workshopTitle: workshop.titulo,
        workshopSlug: workshop.slug,
        monto: enrollment.monto,
        slotFecha,
        slotHora,
        direccion,
        profesorNombre,
        magicUrl: undefined,
      })

      // Notificar al profesor si hay datos disponibles
      if (profesorEmail && profesorNombre) {
        const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'
        const esClasePrueba = !!(enrollment as unknown as { esClasePrueba?: boolean }).esClasePrueba
        await sendClasePruebaProfesor({
          profesorEmail,
          profesorNombre,
          studentName: student.name,
          studentEmail: student.email,
          workshopTitle: workshop.titulo,
          slotFecha,
          slotHora,
          dashboardUrl: `${baseUrl}/tallerista`,
          esClasePrueba,
        }).catch(() => { /* no bloquear */ })
      }
    } catch {
      // No bloquear el flujo por fallo de email
    }

    return {}
  },

  // [FINANCE RISK] Procesa pago aprobado de suscripción recurrente
  // Crea PaymentBreakdown SOLO cuando MP confirma el pago (Principio #10).
  async handleApprovedSubscription(subscriptionId: string, paymentId: string): Promise<void> {
    await dbConnect()

    const subscription = await Subscription.findById(subscriptionId)
    if (!subscription) return

    // [IDEMPOTENCIA] Guard primario: mismo paymentId ya procesado para esta sub
    if (subscription.estado === 'activa' && subscription.pagoRef === String(paymentId)) return
    // [IDEMPOTENCIA] Guard secundario: ya existe breakdown con este mercadoPagoId
    const existingBreakdown = await PaymentBreakdown.findOne({ mercadoPagoId: String(paymentId) })
      .lean<{ _id: mongoose.Types.ObjectId }>()
    if (existingBreakdown) {
      // Pago ya procesado (race o retry); asegurar que la sub quede activa y retornar
      if (subscription.estado !== 'activa' || subscription.pagoRef !== String(paymentId)) {
        subscription.pagoRef = String(paymentId)
        subscription.estado = 'activa'
        subscription.paymentBreakdownId = existingBreakdown._id
        await subscription.save()
      }
      return
    }

    // [FIADO][DOBLE COBRO] Sub ya activa cuya deuda a confianza YA fue saldada.
    // Un pago MP entrante aquí corresponde a un link viejo pagado tarde (p. ej. el
    // tallerista marcó la deuda como efectivo/transferencia y luego el alumno pagó el
    // link). No crear un segundo PaymentBreakdown: evita doble cobro al tallerista.
    // Las inscripciones/renovaciones legítimas crean subs en 'pendiente_pago', por lo
    // que nunca caen en esta rama (requiere estado 'activa' + fiado ya saldado).
    if (subscription.estado === 'activa' && subscription.pagoFiado?.saldado === true) {
      await FinanceService.log(
        'ajuste',
        'PaymentBreakdown',
        String(subscription.paymentBreakdownId ?? subscription._id),
        0,
        String(subscription.studentId),
        0,
        {
          motivo: 'pago_fiado_duplicado_ignorado',
          paymentId: String(paymentId),
          metodoPagoFinalPrevio: subscription.pagoFiado.metodoPagoFinal ?? null,
        }
      )
      return
    }

    const workshop = await Workshop.findById(subscription.workshopId)
      .select('ownerId precioModalidad')
      .lean<{ _id: mongoose.Types.ObjectId; ownerId: mongoose.Types.ObjectId; precioModalidad?: 'neto' | 'bruto' }>()
    if (!workshop) throw new Error('Taller no encontrado al confirmar suscripción')

    const feePct = await SiteConfigService.getComisionPct()
    const desglose = FinanceService.calcularDesglose(subscription.monto, feePct)

    // [CICLO][INMUTABLE] Crear SIEMPRE un nuevo PaymentBreakdown por ciclo.
    // No reutilizar ni mutar el breakdown de ciclos anteriores.
    const session = await mongoose.startSession()
    let newBreakdownId: mongoose.Types.ObjectId | undefined
    try {
      await session.withTransaction(async () => {
        const [breakdown] = await PaymentBreakdown.create([{
          subscriptionId: subscription._id,
          workshopId: subscription.workshopId,
          ownerId: workshop.ownerId,
          studentId: subscription.studentId,
          montoBruto: desglose.montoBruto,
          comisionMP: 0,
          feeTallerea: desglose.feeTallerea,
          montoProfesor: desglose.montoProfesor,
          porcentajeFee: feePct,
          precioModalidad: workshop.precioModalidad ?? 'bruto',
          tipo: 'pago',
          estado: 'cobrado',
          mercadoPagoId: String(paymentId),
          fechaCobro: new Date(),
        }], { session })
        newBreakdownId = breakdown._id as mongoose.Types.ObjectId

        // Activar suscripción dentro de la misma transacción
        subscription.paymentBreakdownId = newBreakdownId
        subscription.pagoRef = String(paymentId)
        subscription.estado = 'activa'
        // [PREPAGADO] Si la sub se creó en pendiente_pago con clasesPrepagadas sin
        // fechaPago/metodoPago (link MP), completarlos ahora que MP confirmó el pago.
        if (subscription.clasesPrepagadas?.cantidad && !subscription.clasesPrepagadas.fechaPago) {
          subscription.clasesPrepagadas.fechaPago = new Date()
          subscription.clasesPrepagadas.metodoPago = 'mercadopago'
        }
        // [FIADO] Si la sub tenía deuda a confianza, el pago MP la salda.
        if (subscription.pagoFiado && !subscription.pagoFiado.saldado) {
          subscription.pagoFiado.saldado = true
          subscription.pagoFiado.saldadoEn = new Date()
          subscription.pagoFiado.metodoPagoFinal = 'mercadopago'
        }
        // [H3] Limpiar ventana de gracia: el pago manual sana la deuda
        if (subscription.saldoEnGracia) subscription.saldoEnGracia = false
        await subscription.save({ session })

        await FinanceService.logWithSession(
          session,
          'pago_recibido',
          'PaymentBreakdown',
          String(newBreakdownId),
          subscription.monto,
          String(subscription.studentId)
        )
      })
    } finally {
      await session.endSession()
    }

    // Email al alumno + notificación al tallerista
    try {
      const workshopFull = await Workshop.findById(subscription.workshopId)
        .populate<{ ownerId: { _id: string; name: string; email: string } }>('ownerId', 'name email')
        .lean<{ titulo: string; slug: string; ownerId: { _id: string; name: string; email: string } }>()
      const student = await User.findById(subscription.studentId).select('name email password').lean<{
        _id: string; name: string; email: string; password?: string
      }>()
      if (!workshopFull || !student) return

      // Si el alumno es invitado (sin password), emitir magic link para que pueda entrar
      // y reservar sus sesiones. Sin esto, el alumno paga pero queda sin acceso al panel.
      let magicUrl: string | undefined
      if (!student.password) {
        try {
          const { issueMagicLink } = await import('@/lib/issueMagicLink')
          const result = await issueMagicLink(String(student._id))
          magicUrl = result.magicUrl
        } catch {
          // No bloquear el flujo de confirmación por fallo de emisión
        }
      }

      // Email al alumno (CTA "Activar mi cuenta" cuando hay magicUrl)
      await sendEnrollmentConfirmation({
        studentName: student.name,
        studentEmail: student.email,
        workshopTitle: workshopFull.titulo,
        workshopSlug: workshopFull.slug,
        monto: subscription.monto,
        magicUrl,
      })

      // Notificación al tallerista
      if (workshopFull.ownerId?.email && workshopFull.ownerId?.name) {
        const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'
        await sendClasePruebaProfesor({
          profesorEmail: workshopFull.ownerId.email,
          profesorNombre: workshopFull.ownerId.name,
          studentName: student.name,
          studentEmail: student.email,
          workshopTitle: workshopFull.titulo,
          dashboardUrl: `${baseUrl}/tallerista`,
          esClasePrueba: false,
          esSuscripcion: true,
        }).catch(() => { /* no bloquear */ })
      }
    } catch {
      // No bloquear el flujo por fallo de email
    }
  },

  // [FINANCE RISK][PREPAGADO] Acredita recarga de paquete a una suscripción activa.
  // No crea una nueva Subscription: suma clases al saldo existente y extiende vencimiento.
  // Idempotencia por mercadoPagoId unique en PaymentBreakdown.
  async handleApprovedRecarga(subscriptionId: string, paqueteId: string, paymentId: string): Promise<void> {
    await dbConnect()

    // [IDEMPOTENCIA] Si ya existe breakdown para este paymentId, no reprocesar
    const existingBreakdown = await PaymentBreakdown.findOne({ mercadoPagoId: String(paymentId) }).lean<{ _id: mongoose.Types.ObjectId }>()
    if (existingBreakdown) return

    const subscription = await Subscription.findById(subscriptionId)
    if (!subscription) return
    if (subscription.estado !== 'activa') {
      // No se acreditan recargas a subs vencidas/canceladas. MP igual recibe 200.
      return
    }

    const workshop = await Workshop.findById(subscription.workshopId)
      .select('ownerId precioModalidad paquetes plan politica')
      .lean<{
        _id: mongoose.Types.ObjectId
        ownerId: mongoose.Types.ObjectId
        precioModalidad?: 'neto' | 'bruto'
        paquetes?: { _id: mongoose.Types.ObjectId; nombre: string; precio: number; sesionesIncluidas: number; duracionDias: number; activo: boolean }[]
        plan?: { sesionesIncluidas: number }
        politica?: { rolloverActivo?: boolean; topeAcumulacionFactor?: number; mesesGraciaAlCancelar?: number; maxReservasSimultaneas?: number }
      }>()
    if (!workshop) throw new Error('Taller no encontrado al acreditar recarga')

    const paquete = workshop.paquetes?.find(p => String(p._id) === paqueteId)
    if (!paquete) throw new Error('Paquete no encontrado al acreditar recarga')

    // [CUADRATURA] Crear PaymentBreakdown — inmutable, idempotente por mercadoPagoId
    const feePct = await SiteConfigService.getComisionPct()
    const desglose = FinanceService.calcularDesglose(paquete.precio, feePct)

    try {
      await new PaymentBreakdown({
        subscriptionId: subscription._id,
        workshopId: subscription.workshopId,
        ownerId: workshop.ownerId,
        studentId: subscription.studentId,
        montoBruto: desglose.montoBruto,
        comisionMP: 0,
        feeTallerea: desglose.feeTallerea,
        montoProfesor: desglose.montoProfesor,
        porcentajeFee: feePct,
        precioModalidad: workshop.precioModalidad ?? 'bruto',
        tipo: 'pago',
        estado: 'cobrado',
        mercadoPagoId: String(paymentId),
        fechaCobro: new Date(),
      }).save()
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code
      if (code === 11000) return // E11000 → ya procesado por reintento del webhook
      throw err
    }

    // [BANCO DE SESIONES] Aplicar tope de acumulación (H2) — aplica a todos los flujos de pago
    const sesionesBaseCiclo = workshop.plan?.sesionesIncluidas ?? 4
    const politicaRolloverR = await SiteConfigService.resolverPoliticaRollover(workshop.politica)
    const topeResultR = SiteConfigService.aplicarTopeAcumulacion(
      subscription.sesionesDisponibles,
      paquete.sesionesIncluidas,
      sesionesBaseCiclo,
      politicaRolloverR,
      subscription.pagoAutomatico ?? false,
    )
    subscription.sesionesTotales += (paquete.sesionesIncluidas - topeResultR.sesionesDescartadas)
    subscription.sesionesDisponibles = topeResultR.nuevoSaldo

    // Extender vencimiento: desde el mayor entre fechaVencimiento actual y hoy
    if (paquete.duracionDias && paquete.duracionDias > 0) {
      const base = subscription.fechaVencimiento > new Date() ? subscription.fechaVencimiento : new Date()
      subscription.fechaVencimiento = new Date(base.getTime() + paquete.duracionDias * 24 * 60 * 60 * 1000)
    }
    // [H3] Limpiar ventana de gracia si el alumno renueva manualmente
    if (subscription.saldoEnGracia) subscription.saldoEnGracia = false
    await subscription.save()

    // [BANCO DE SESIONES] Notificar al alumno si se descartaron sesiones por tope
    if (topeResultR.sesionesDescartadas > 0) {
      try {
        const { sendTopeSesionesAlcanzado } = await import('@/lib/resend')
        const [student, workshopFull] = await Promise.all([
          User.findById(subscription.studentId).select('name email').lean<{ name: string; email: string }>(),
          Workshop.findById(subscription.workshopId).select('titulo').lean<{ titulo: string }>(),
        ])
        if (student && workshopFull) {
          await sendTopeSesionesAlcanzado({
            studentName: student.name,
            studentEmail: student.email,
            workshopTitle: workshopFull.titulo,
            sesionesDescartadas: topeResultR.sesionesDescartadas,
            topeAcumulacion: sesionesBaseCiclo * politicaRolloverR.topeAcumulacionFactor,
          }).catch(() => { /* no bloquear */ })
        }
      } catch { /* no bloquear flujo */ }
    }

    // Audit log
    try {
      await FinanceService.log(
        'pago_recibido',
        'PaymentBreakdown',
        String(subscription._id),
        paquete.precio,
        String(subscription.studentId)
      )
    } catch {
      // No bloquear flujo
    }
  },

  /**
   * [PREPAGADO] Acredita renovación al precio acordado (precioSnapshot) en una suscripción activa.
   * Invocado por el webhook con externalRef = 'prn:<subId>'.
   * Suma las mismas clases que el lote original (clasesPrepagadas.cantidad) y extiende vencimiento 30 días.
   * Idempotencia por mercadoPagoId unique en PaymentBreakdown.
   */
  async handleApprovedPrepaidRenewal(subscriptionId: string, paymentId: string): Promise<void> {
    await dbConnect()

    // [IDEMPOTENCIA] Si ya existe breakdown para este paymentId, no reprocesar
    const existingBreakdown = await PaymentBreakdown.findOne({ mercadoPagoId: String(paymentId) }).lean<{ _id: mongoose.Types.ObjectId }>()
    if (existingBreakdown) return

    const subscription = await Subscription.findById(subscriptionId)
    if (!subscription) return
    if (subscription.estado !== 'activa') return  // no acreditar a subs canceladas/vencidas

    const cantidad = subscription.clasesPrepagadas?.cantidad
    if (!cantidad || cantidad < 1) return  // sin info de lote, no hay nada que acreditar

    const monto = subscription.precioSnapshot ?? subscription.monto
    if (!monto || monto <= 0) return

    const workshop = await Workshop.findById(subscription.workshopId)
      .select('ownerId precioModalidad plan politica')
      .lean<{ _id: mongoose.Types.ObjectId; ownerId: mongoose.Types.ObjectId; precioModalidad?: 'neto' | 'bruto'; plan?: { sesionesIncluidas: number }; politica?: { rolloverActivo?: boolean; topeAcumulacionFactor?: number; mesesGraciaAlCancelar?: number; maxReservasSimultaneas?: number } }>()
    if (!workshop) throw new Error('Taller no encontrado al acreditar renovación prepagada')

    // [CUADRATURA] Crear PaymentBreakdown — inmutable, idempotente por mercadoPagoId
    const feePct = await SiteConfigService.getComisionPct()
    const desglose = FinanceService.calcularDesglose(monto, feePct)

    try {
      await new PaymentBreakdown({
        subscriptionId: subscription._id,
        workshopId: subscription.workshopId,
        ownerId: workshop.ownerId,
        studentId: subscription.studentId,
        montoBruto: desglose.montoBruto,
        comisionMP: 0,
        feeTallerea: desglose.feeTallerea,
        montoProfesor: desglose.montoProfesor,
        porcentajeFee: feePct,
        precioModalidad: workshop.precioModalidad ?? 'bruto',
        tipo: 'pago',
        estado: 'cobrado',
        mercadoPagoId: String(paymentId),
        fechaCobro: new Date(),
      }).save()
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code
      if (code === 11000) return  // E11000 → ya procesado por reintento del webhook
      throw err
    }

    // [BANCO DE SESIONES] Aplicar tope de acumulación (H2)
    const sesionesBasePRN = workshop.plan?.sesionesIncluidas ?? cantidad
    const politicaRolloverPRN = await SiteConfigService.resolverPoliticaRollover(workshop.politica)
    const topeResultPRN = SiteConfigService.aplicarTopeAcumulacion(
      subscription.sesionesDisponibles,
      cantidad,
      sesionesBasePRN,
      politicaRolloverPRN,
      subscription.pagoAutomatico ?? false,
    )
    subscription.sesionesTotales += (cantidad - topeResultPRN.sesionesDescartadas)
    subscription.sesionesDisponibles = topeResultPRN.nuevoSaldo
    const base = subscription.fechaVencimiento > new Date() ? subscription.fechaVencimiento : new Date()
    subscription.fechaVencimiento = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000)
    // Actualizar fechaPago del lote prepagado al momento de este pago
    if (subscription.clasesPrepagadas) {
      subscription.clasesPrepagadas.fechaPago = new Date()
      subscription.clasesPrepagadas.metodoPago = 'mercadopago'
    }
    // [H3] Limpiar ventana de gracia si el alumno renueva manualmente
    if (subscription.saldoEnGracia) subscription.saldoEnGracia = false
    await subscription.save()

    // [BANCO DE SESIONES] Notificar al alumno si se descartaron sesiones por tope
    if (topeResultPRN.sesionesDescartadas > 0) {
      try {
        const { sendTopeSesionesAlcanzado } = await import('@/lib/resend')
        const [student, workshopFull] = await Promise.all([
          User.findById(subscription.studentId).select('name email').lean<{ name: string; email: string }>(),
          Workshop.findById(subscription.workshopId).select('titulo').lean<{ titulo: string }>(),
        ])
        if (student && workshopFull) {
          await sendTopeSesionesAlcanzado({
            studentName: student.name,
            studentEmail: student.email,
            workshopTitle: workshopFull.titulo,
            sesionesDescartadas: topeResultPRN.sesionesDescartadas,
            topeAcumulacion: sesionesBasePRN * politicaRolloverPRN.topeAcumulacionFactor,
          }).catch(() => { /* no bloquear */ })
        }
      } catch { /* no bloquear flujo */ }
    }

    // Audit log
    try {
      await FinanceService.log(
        'pago_recibido',
        'PaymentBreakdown',
        String(subscription._id),
        monto,
        String(subscription.studentId)
      )
    } catch {
      // No bloquear flujo
    }
  },

  // ─────────────────────────────────────────────────────────────────
  // Pago automático — cobro recurrente vía preapproval
  // ─────────────────────────────────────────────────────────────────

  /**
   * [FINANCE RISK] Acredita un cobro recurrente de preapproval.
   * Invocado desde el webhook `subscription_authorized_payment`.
   *
   * @param subscriptionId - _id de Subscription (extraído de external_reference = "pa:<id>")
   * @param authorizedPaymentId - ID único del cobro (clave de idempotencia en mercadoPagoId)
   * @param transactionAmount - CLP entero cobrado por MP en este ciclo
   * @param comisionMP - monto de la fee MP (informativo, NO entra en la ecuación)
   */
  async handleAuthorizedRecurringPayment(
    subscriptionId: string,
    authorizedPaymentId: string,
    transactionAmount: number,
    comisionMP: number,
  ): Promise<void> {
    await dbConnect()

    // [IDEMPOTENCIA] Guard por mercadoPagoId único en PaymentBreakdown
    const existing = await PaymentBreakdown.findOne({ mercadoPagoId: String(authorizedPaymentId) })
      .lean<{ _id: mongoose.Types.ObjectId }>()
    if (existing) return

    const subscription = await Subscription.findById(subscriptionId)
    if (!subscription) return  // sub no encontrada: no reintentar

    const workshop = await Workshop.findById(subscription.workshopId)
      .select('ownerId precioModalidad plan')
      .lean<{
        _id: mongoose.Types.ObjectId
        ownerId: mongoose.Types.ObjectId
        precioModalidad?: 'neto' | 'bruto'
        plan?: { sesionesIncluidas: number; vigencia: string }
      }>()
    if (!workshop) throw new Error(`[AUTOPAGO] Taller no encontrado para sub ${subscriptionId}`)

    // [CUADRATURA] Calcular desglose con el monto real cobrado por MP
    const feePct = await SiteConfigService.getComisionPct()
    const desglose = FinanceService.calcularDesglose(transactionAmount, feePct)

    // Sesiones a sumar: del plan del taller, o 4 como tope de seguridad
    const sesionesACiclo = workshop.plan?.sesionesIncluidas ?? 4

    // [BANCO DE SESIONES] Fase 7.5 — resolver política de rollover para este taller
    const workshopParaRollover = await Workshop.findById(subscription.workshopId)
      .select('politica')
      .lean<{ politica?: { rolloverActivo?: boolean; topeAcumulacionFactor?: number; mesesGraciaAlCancelar?: number; maxReservasSimultaneas?: number } }>()
    const politicaRollover = await SiteConfigService.resolverPoliticaRollover(workshopParaRollover?.politica)

    const session = await mongoose.startSession()
    let newBreakdownId: mongoose.Types.ObjectId | undefined
    let sesionesDescartadas = 0  // sesiones no acreditadas por tope de acumulación
    try {
      await session.withTransaction(async () => {
        // [INMUTABLE] Crear nuevo PaymentBreakdown por ciclo
        const [breakdown] = await PaymentBreakdown.create([{
          subscriptionId:  subscription._id,
          workshopId:      subscription.workshopId,
          ownerId:         workshop.ownerId,
          studentId:       subscription.studentId,
          montoBruto:      desglose.montoBruto,
          comisionMP,          // informativo; no entra en montoBruto = montoProfesor + feeTallerea
          feeTallerea:     desglose.feeTallerea,
          montoProfesor:   desglose.montoProfesor,
          porcentajeFee:   feePct,
          precioModalidad: workshop.precioModalidad ?? 'bruto',
          tipo:            'pago',
          estado:          'cobrado',
          mercadoPagoId:   String(authorizedPaymentId),
          fechaCobro:      new Date(),
        }], { session })
        newBreakdownId = breakdown._id as mongoose.Types.ObjectId

        // [BANCO DE SESIONES] Tope de acumulación delegado al helper reutilizable
        const topeResult = SiteConfigService.aplicarTopeAcumulacion(
          subscription.sesionesDisponibles,
          sesionesACiclo,  // sesionesAAcreditar == sesionesBaseCiclo en autopago
          sesionesACiclo,
          politicaRollover,
          subscription.pagoAutomatico ?? false,
        )
        sesionesDescartadas = topeResult.sesionesDescartadas
        subscription.sesionesTotales += (sesionesACiclo - sesionesDescartadas)
        subscription.sesionesDisponibles = topeResult.nuevoSaldo

        // Extender fechaVencimiento 1 mes desde el vencimiento vigente (o desde hoy si ya venció)
        const base = subscription.fechaVencimiento > new Date()
          ? subscription.fechaVencimiento
          : new Date()
        const nuevaFecha = new Date(base)
        nuevaFecha.setMonth(nuevaFecha.getMonth() + 1)
        subscription.fechaVencimiento = nuevaFecha

        // Actualizar campos del mandato
        subscription.ultimoCobroAutomaticoEn = new Date()
        subscription.intentosCobroFallidos = 0
        subscription.pagoRef = String(authorizedPaymentId)
        subscription.estado = 'activa'
        // Al cobrar OK, limpiar flag de gracia si estaba activo
        if (subscription.saldoEnGracia) subscription.saldoEnGracia = false
        // [FIADO] Si había deuda a confianza pendiente, queda saldada con este cobro automático
        if (subscription.pagoFiado && !subscription.pagoFiado.saldado) {
          subscription.pagoFiado.saldado = true
          subscription.pagoFiado.saldadoEn = new Date()
          subscription.pagoFiado.metodoPagoFinal = 'mercadopago'
        }

        await subscription.save({ session })

        // [AUDIT] FinanceAuditLog append-only
        await FinanceService.logWithSession(
          session,
          'pago_recibido',
          'PaymentBreakdown',
          String(newBreakdownId),
          transactionAmount,
          String(subscription.studentId),
          undefined,
          { via: 'preapproval', authorizedPaymentId }
        )
      })
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code
      // E11000 = race condition entre retries del webhook; ya procesado
      if (code === 11000) return
      throw err
    } finally {
      await session.endSession()
    }

    // [BANCO DE SESIONES] Notificar al alumno si se alcanzó el tope y se descartaron sesiones
    if (sesionesDescartadas > 0) {
      try {
        const { sendTopeSesionesAlcanzado } = await import('@/lib/resend')
        const student = await User.findById(subscription.studentId).select('name email').lean<{ name: string; email: string }>()
        const workshopFull = await Workshop.findById(subscription.workshopId).select('titulo').lean<{ titulo: string }>()
        if (student && workshopFull) {
          await sendTopeSesionesAlcanzado({
            studentName: student.name,
            studentEmail: student.email,
            workshopTitle: workshopFull.titulo,
            sesionesDescartadas,
            topeAcumulacion: politicaRollover.topeAcumulacionFactor * sesionesACiclo,
          }).catch(() => { /* no bloquear */ })
        }
      } catch {
        // No bloquear flujo principal por fallo de notificación
      }
    }
  },

  /**
   * Sincroniza el estado del mandato preapproval desde MP hacia la Subscription.
   * Invocado desde el webhook `subscription_preapproval`.
   * Si MP cancela el mandato (tarjeta vencida, etc.) → limpia pagoAutomatico.
   */
  async handlePreapprovalStatusUpdate(preapprovalId: string): Promise<void> {
    await dbConnect()

    const sub = await Subscription.findOne({ mpPreapprovalId: preapprovalId })
    if (!sub) return  // puede ser un mandato de otro sistema; no es error

    // Obtener estado actual desde MP
    const { getPreapproval } = await import('@/lib/mercadopago')
    const preapproval = await getPreapproval(preapprovalId)

    const newStatus = preapproval.status as ISubscription['mpPreapprovalStatus']
    if (sub.mpPreapprovalStatus === newStatus) return  // sin cambio

    sub.mpPreapprovalStatus = newStatus

    // Si MP lo canceló, limpiar el mandato localmente para que el alumno pueda re-activar
    if (newStatus === 'cancelled') {
      // [BANCO DE SESIONES] Fase 7.5 — si hay saldo acumulado, aplicar ventana de gracia
      if (sub.sesionesDisponibles > 0) {
        const workshopFull = await Workshop.findById(sub.workshopId)
          .select('politica').lean<{ politica?: { rolloverActivo?: boolean; mesesGraciaAlCancelar?: number } }>()
        const politica = await SiteConfigService.resolverPoliticaRollover(workshopFull?.politica)
        if (politica.rolloverActivo) {
          const nuevaFechaGracia = new Date()
          nuevaFechaGracia.setMonth(nuevaFechaGracia.getMonth() + politica.mesesGraciaAlCancelar)
          if (!sub.fechaVencimiento || nuevaFechaGracia > sub.fechaVencimiento) {
            sub.fechaVencimiento = nuevaFechaGracia
          }
          sub.saldoEnGracia = true
        }
      }
      sub.pagoAutomatico = false
      sub.mpPreapprovalId = undefined
      sub.mpPreapprovalStatus = undefined
      sub.cardLast4 = undefined
    }

    await sub.save()
  },

  /**
   * [CICLO] Maneja un cobro recurrente rechazado por MP.
   * - Incrementa intentosCobroFallidos.
   * - Si alcanza maxIntentosCobroFallido: degrada a manual (limpia mandato, no corta acceso).
   * - Envía email correspondiente al alumno.
   */
  async handleRejectedRecurringPayment(
    subscriptionId: string,
    authorizedPaymentId: string,
  ): Promise<void> {
    await dbConnect()

    const sub = await Subscription.findById(subscriptionId)
    if (!sub) return

    const config = await SiteConfigService.get()
    const maxIntentos = config.maxIntentosCobroFallido ?? 3
    const nuevoContador = (sub.intentosCobroFallidos ?? 0) + 1
    const debeDegradar = nuevoContador >= maxIntentos
    const preapprovalIdCapturado = sub.mpPreapprovalId

    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        sub.intentosCobroFallidos = nuevoContador
        if (debeDegradar) {
          // Degradar ≠ cancelar: el alumno conserva acceso mientras tiene sesiones.
          // [BANCO DE SESIONES] Fase 7.5 — aplicar ventana de gracia si hay saldo acumulado
          if ((sub.sesionesDisponibles ?? 0) > 0) {
            const workshopFull = await Workshop.findById(sub.workshopId)
              .select('politica').lean<{ politica?: { rolloverActivo?: boolean; mesesGraciaAlCancelar?: number } }>()
            const politica = await SiteConfigService.resolverPoliticaRollover(workshopFull?.politica)
            if (politica.rolloverActivo) {
              const nuevaFechaGracia = new Date()
              nuevaFechaGracia.setMonth(nuevaFechaGracia.getMonth() + politica.mesesGraciaAlCancelar)
              if (!sub.fechaVencimiento || nuevaFechaGracia > sub.fechaVencimiento) {
                sub.fechaVencimiento = nuevaFechaGracia
              }
              sub.saldoEnGracia = true
            }
          }
          sub.pagoAutomatico = false
          sub.mpPreapprovalId = undefined
          sub.mpPreapprovalStatus = undefined
          sub.cardLast4 = undefined
          if ((sub.sesionesDisponibles ?? 0) <= 0) {
            sub.estado = 'pendiente_pago'
          }
        }
        await sub.save({ session })
      })
    } finally {
      await session.endSession()
    }

    // Cancelar preapproval en MP tras degradación (fuera de tx; no crítico)
    if (debeDegradar && preapprovalIdCapturado) {
      const { cancelPreapproval } = await import('@/lib/mercadopago')
      cancelPreapproval(preapprovalIdCapturado).catch((err) =>
        console.warn(`[AUTOPAGO] cancelPreapproval tras degradación sub=${subscriptionId}:`, err)
      )
    }

    const [student, workshop] = await Promise.all([
      User.findById(sub.studentId).select('name email').lean<{ name: string; email: string }>(),
      Workshop.findById(sub.workshopId).select('titulo slug').lean<{ titulo: string; slug: string }>(),
    ])
    if (!student?.email || !workshop) return

    const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'
    const panelUrl = `${baseUrl}/alumno/suscripciones`

    if (debeDegradar) {
      const { sendCobroFallidoMaxIntentos } = await import('@/lib/resend')
      await sendCobroFallidoMaxIntentos({
        email: student.email, name: student.name,
        workshopTitulo: workshop.titulo, workshopSlug: workshop.slug,
        panelUrl,
      }).catch(() => null)
    } else {
      const { sendCobroFallido } = await import('@/lib/resend')
      await sendCobroFallido({
        email: student.email, name: student.name,
        workshopTitulo: workshop.titulo,
        intentos: nuevoContador, maxIntentos,
        panelUrl,
      }).catch(() => null)
    }

    console.warn(
      `[AUTOPAGO] cobro rechazado sub=${subscriptionId} authorizedPaymentId=${authorizedPaymentId}` +
      ` intentos=${nuevoContador}/${maxIntentos} degradado=${debeDegradar}`
    )
  },
}
