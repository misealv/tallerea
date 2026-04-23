import dbConnect from '@/lib/db'
import { EnrollmentService } from '@/services/EnrollmentService'
import { WorkshopService } from '@/services/WorkshopService'
import { FinanceService } from '@/services/FinanceService'
import { createPaymentPreference } from '@/lib/mercadopago'
import { sendEnrollmentConfirmation } from '@/lib/resend'
import { issueMagicLink } from '@/lib/issueMagicLink'
import PaymentBreakdown from '@/models/PaymentBreakdown'
import Account from '@/models/Account'
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
  ): Promise<CreatePaymentResult> {
    const workshop = await WorkshopService.getById(workshopId)
    if (!workshop) throw new Error('Taller no encontrado')

    // Crear enrollment pendiente. Si usarCredito=true, EnrollmentService.create descuenta crédito
    // dentro de su transacción y persiste el monto aplicado en enrollment.creditoAplicado.
    const enrollment = await EnrollmentService.create({
      workshopId,
      studentId,
      monto: workshop.precio,
      slotIndex: slotIndex ?? null,
      usarCredito,
    })

    const enrollmentId = String(enrollment._id)
    const creditoAplicado = enrollment.creditoAplicado ?? 0
    // [FINANCE RISK] montoACobrar es lo que MP debe cobrar; el profesor cobra siempre el bruto completo
    const montoACobrar = Math.max(0, workshop.precio - creditoAplicado)

    // Taller gratuito o crédito cubre 100%: marcar pagado directamente, sin preference MP
    if (workshop.precio === 0 || montoACobrar === 0) {
      await EnrollmentService.update(enrollmentId, { estado: 'pagado' })

      // [CUADRATURA] Si el taller no es gratuito (había precio pero crédito lo cubrió),
      // crear PaymentBreakdown para que el profesor cobre su parte en la liquidación
      if (workshop.precio > 0) {
        await this._createBreakdownForEnrollment(enrollmentId, null)
      }

      try {
        await sendEnrollmentConfirmation({
          studentName,
          studentEmail,
          workshopTitle: workshop.titulo,
          workshopSlug: workshop.slug,
          monto: workshop.precio,
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
    })

    return {
      enrollmentId,
      preferenceId: preference.id,
      initPoint: preference.init_point,
    }
  },

  // [FINANCE RISK][CUADRATURA] Helper privado: crea PaymentBreakdown para un enrollment pagado.
  // paymentId = null cuando el pago se cubrió 100% con crédito (sin transacción MP).
  async _createBreakdownForEnrollment(enrollmentId: string, paymentId: string | null): Promise<void> {
    const enrollment = await EnrollmentService.getById(enrollmentId)
    if (!enrollment) return

    const workshop = enrollment.workshopId as unknown as {
      _id: string; titulo: string; slug: string; accountId: string; precio: number
    }

    const account = await Account.findById(workshop.accountId)
    const feePct = await SiteConfigService.getComisionPct()
    // montoBruto = precio completo (lo que debe cobrar el profesor).
    // El crédito aplicado sale del margen de Tallerea, no descuenta al profesor.
    const desglose = FinanceService.calcularDesglose(enrollment.monto, feePct)

    const breakdown = await new PaymentBreakdown({
      enrollmentId,
      workshopId:      workshop._id,
      accountId:       workshop.accountId,
      studentId:       enrollment.studentId,
      montoBruto:      desglose.montoBruto,
      comisionMP:      0,
      feeTallerea:     desglose.feeTallerea,
      montoProfesor:   desglose.montoProfesor,
      creditoAplicado: enrollment.creditoAplicado ?? 0,
      porcentajeFee:   feePct,
      precioModalidad: account?.precioModalidad ?? 'bruto',
      tipo:            'pago',
      estado:          'cobrado',
      mercadoPagoId:   paymentId ?? undefined,
      fechaCobro:      new Date(),
    }).save()

    await FinanceService.log(
      'pago_recibido',
      'PaymentBreakdown',
      String(breakdown._id),
      enrollment.monto,
      String(enrollment.studentId)
    )
  },

  // [FINANCE RISK] Procesa pago aprobado: crea PaymentBreakdown + actualiza enrollment + email
  async handleApprovedPayment(enrollmentId: string, paymentId: string): Promise<void> {
    await dbConnect()

    await EnrollmentService.update(enrollmentId, {
      estado: 'pagado',
      pagoRef: String(paymentId),
    })

    // Crear PaymentBreakdown (reutiliza helper)
    await this._createBreakdownForEnrollment(enrollmentId, String(paymentId))

    const enrollment = await EnrollmentService.getById(enrollmentId)
    if (!enrollment) return

    const workshop = enrollment.workshopId as unknown as {
      _id: string; titulo: string; slug: string; accountId: string; precio: number
    }

    // Enviar email de confirmación
    try {
      const student = enrollment.studentId as unknown as { _id: string; name: string; email: string }

      // Si el alumno no tiene password (es invitado), emitir magic link para activar cuenta
      let magicUrl: string | undefined
      const fullStudent = await User.findById(student._id).select('password').lean<{ password?: string }>()
      const isGuest = !fullStudent?.password
      if (isGuest) {
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
        monto: enrollment.monto,
        magicUrl,
      })
    } catch {
      // No bloquear el flujo por fallo de email
    }
  },

  // [FINANCE RISK] Procesa pago aprobado de suscripción recurrente
  async handleApprovedSubscription(subscriptionId: string, paymentId: string): Promise<void> {
    await dbConnect()

    const subscription = await Subscription.findById(subscriptionId)
    if (!subscription) return

    // Idempotencia: si ya tiene pagoRef seteado igual al actual, no reprocesar
    if (subscription.pagoRef === String(paymentId)) return

    // Marcar pagoRef + asegurar estado activa
    subscription.pagoRef = String(paymentId)
    if (subscription.estado !== 'activa') subscription.estado = 'activa'
    await subscription.save()

    // [CUADRATURA] Marcar PaymentBreakdown asociado como cobrado
    if (subscription.paymentBreakdownId) {
      await PaymentBreakdown.updateOne(
        { _id: subscription.paymentBreakdownId, estado: 'pendiente' },
        { estado: 'cobrado', mercadoPagoId: String(paymentId), fechaCobro: new Date() }
      )
    }

    // Audit log
    await FinanceService.log(
      'pago_recibido',
      'PaymentBreakdown',
      String(subscription.paymentBreakdownId ?? subscription._id),
      subscription.monto,
      String(subscription.studentId)
    )

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
