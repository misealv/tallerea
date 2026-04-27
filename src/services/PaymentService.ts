import dbConnect from '@/lib/db'
import mongoose from 'mongoose'
import { EnrollmentService } from '@/services/EnrollmentService'
import { WorkshopService } from '@/services/WorkshopService'
import { FinanceService } from '@/services/FinanceService'
import { createPaymentPreference } from '@/lib/mercadopago'
import { sendEnrollmentConfirmation, sendClasePruebaProfesor } from '@/lib/resend'
import { issueMagicLink } from '@/lib/issueMagicLink'
import PaymentBreakdown from '@/models/PaymentBreakdown'
import User from '@/models/User'
import Subscription from '@/models/Subscription'
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
      enrollment = await EnrollmentService.reservarPrueba(workshopId, studentId, slotIndex ?? null)
    } else {
      // Crear enrollment pendiente. Si usarCredito=true, EnrollmentService.create descuenta crédito
      enrollment = await EnrollmentService.create({
        workshopId,
        studentId,
        monto: montoBase,
        slotIndex: slotIndex ?? null,
        usarCredito,
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
    if (current.estado === 'pagado' && current.pagoRef === String(paymentId)) return {}

    await EnrollmentService.update(enrollmentId, {
      estado: 'pagado',
      pagoRef: String(paymentId),
    })

    // Crear PaymentBreakdown (idempotente, captura E11000)
    try {
      await this._createBreakdownForEnrollment(enrollmentId, String(paymentId))
    } catch (err) {
      // Logueamos pero no bloqueamos: el enrollment ya quedó pagado, el breakdown
      // puede recrearse con un script de reconciliación si falla acá.
      console.error('[handleApprovedPayment] breakdown error:', err instanceof Error ? err.message : err)
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
            slotFecha = new Intl.DateTimeFormat('es-CL', {
              weekday: 'long', day: 'numeric', month: 'long',
              timeZone: 'America/Santiago',
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
    let generatedMagicUrl: string | undefined
    try {
      const student = enrollment.studentId as unknown as { _id: string; name: string; email: string }

      // Si el alumno no tiene password (es invitado), emitir magic link para activar cuenta
      const fullStudent = await User.findById(student._id).select('password').lean<{ password?: string }>()
      const isGuest = !fullStudent?.password
      if (isGuest) {
        try {
          const result = await issueMagicLink(String(student._id))
          generatedMagicUrl = result.magicUrl
        } catch {
          // Si falla emisión, enviar email igual sin magic link
        }
      }

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
        magicUrl: generatedMagicUrl,
      })

      // Notificar al profesor si hay datos disponibles
      if (profesorEmail && profesorNombre) {
        const baseUrl = process.env.NEXTAUTH_URL || 'https://tallerea.cl'
        await sendClasePruebaProfesor({
          profesorEmail,
          profesorNombre,
          studentName: student.name,
          studentEmail: student.email,
          workshopTitle: workshop.titulo,
          slotFecha,
          slotHora,
          dashboardUrl: `${baseUrl}/tallerista`,
        }).catch(() => { /* no bloquear */ })
      }
    } catch {
      // No bloquear el flujo por fallo de email
    }

    return { magicUrl: generatedMagicUrl }
  },

  // [FINANCE RISK] Procesa pago aprobado de suscripción recurrente
  // Crea PaymentBreakdown SOLO cuando MP confirma el pago (Principio #10).
  async handleApprovedSubscription(subscriptionId: string, paymentId: string): Promise<void> {
    await dbConnect()

    const subscription = await Subscription.findById(subscriptionId)
    if (!subscription) return

    // [IDEMPOTENCIA] Si ya está activa con este pagoRef, no reprocesar
    if (subscription.estado === 'activa' && subscription.pagoRef === String(paymentId)) return

    // [CUADRATURA] Crear PaymentBreakdown si aún no existe (idempotencia por mercadoPagoId)
    if (!subscription.paymentBreakdownId) {
      const workshop = await Workshop.findById(subscription.workshopId).select('ownerId precioModalidad').lean<{
        _id: mongoose.Types.ObjectId; ownerId: mongoose.Types.ObjectId; precioModalidad?: 'neto' | 'bruto'
      }>()
      if (!workshop) throw new Error('Taller no encontrado al confirmar suscripción')

      const feePct = await SiteConfigService.getComisionPct()
      const desglose = FinanceService.calcularDesglose(subscription.monto, feePct)

      try {
        const breakdown = await new PaymentBreakdown({
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
        subscription.paymentBreakdownId = breakdown._id as mongoose.Types.ObjectId
      } catch (err: unknown) {
        // E11000 mercadoPagoId duplicado → ya existe breakdown para este pago, recuperarlo
        const code = (err as { code?: number })?.code
        if (code === 11000) {
          const existing = await PaymentBreakdown.findOne({ mercadoPagoId: String(paymentId) }).lean<{ _id: mongoose.Types.ObjectId }>()
          if (existing) subscription.paymentBreakdownId = existing._id
        } else {
          throw err
        }
      }
    } else {
      // Ya había breakdown vinculado (renovación con breakdown previo) — actualizar a cobrado
      await PaymentBreakdown.updateOne(
        { _id: subscription.paymentBreakdownId, estado: 'pendiente' },
        { estado: 'cobrado', mercadoPagoId: String(paymentId), fechaCobro: new Date() }
      )
    }

    // Activar suscripción
    subscription.pagoRef = String(paymentId)
    subscription.estado = 'activa'
    await subscription.save()

    // Audit log
    try {
      await FinanceService.log(
        'pago_recibido',
        'PaymentBreakdown',
        String(subscription.paymentBreakdownId ?? subscription._id),
        subscription.monto,
        String(subscription.studentId)
      )
    } catch {
      // No bloquear flujo por fallo de audit
    }

    // Email + magic link si guest
    try {
      const workshop = await Workshop.findById(subscription.workshopId).lean<{ titulo: string; slug: string }>()
      const student = await User.findById(subscription.studentId).select('+password name email').lean<{
        _id: string; name: string; email: string; password?: string
      }>()
      if (!workshop || !student) return

      let magicUrl: string | undefined
      if (!student.password) {
        try {
          const result = await issueMagicLink(String(student._id))
          magicUrl = result.magicUrl
        } catch {
          // Si falla emisión, enviar email igual sin magic link
        }
      }

      await sendEnrollmentConfirmation({
        studentName: student.name,
        studentEmail: student.email,
        workshopTitle: workshop.titulo,
        workshopSlug: workshop.slug,
        monto: subscription.monto,
        magicUrl,
      })
    } catch {
      // No bloquear el flujo por fallo de email
    }
  },
}
