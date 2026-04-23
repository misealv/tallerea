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
import { SiteConfigService } from '@/services/SiteConfigService'

interface CreatePaymentResult {
  free?: boolean
  enrollmentId: string
  preferenceId?: string | null
  initPoint?: string | null
}

export const PaymentService = {

  // Crea inscripción + preferencia de pago (o marca pagado si es gratis)
  async createEnrollmentWithPayment(
    workshopId: string,
    studentId: string,
    studentName: string,
    studentEmail: string,
    slotIndex?: number | null
  ): Promise<CreatePaymentResult> {
    const workshop = await WorkshopService.getById(workshopId)
    if (!workshop) throw new Error('Taller no encontrado')

    // Crear enrollment pendiente con slotIndex
    const enrollment = await EnrollmentService.create({
      workshopId,
      studentId,
      monto: workshop.precio,
      slotIndex: slotIndex ?? null,
    })

    const enrollmentId = String(enrollment._id)

    // Taller gratuito: marcar pagado directamente
    if (workshop.precio === 0) {
      await EnrollmentService.update(enrollmentId, { estado: 'pagado' })

      try {
        await sendEnrollmentConfirmation({
          studentName,
          studentEmail,
          workshopTitle: workshop.titulo,
          workshopSlug: workshop.slug,
          monto: 0,
        })
      } catch {
        // No bloquear inscripción por fallo de email
      }

      return { free: true, enrollmentId }
    }

    // Crear preferencia de pago en MercadoPago
    const preference = await createPaymentPreference({
      enrollmentId,
      workshopTitle: workshop.titulo,
      amount: workshop.precio,
      payerEmail: studentEmail,
    })

    return {
      enrollmentId,
      preferenceId: preference.id,
      initPoint: preference.init_point,
    }
  },

  // [FINANCE RISK] Procesa pago aprobado: crea PaymentBreakdown + actualiza enrollment + email
  async handleApprovedPayment(enrollmentId: string, paymentId: string): Promise<void> {
    await dbConnect()

    await EnrollmentService.update(enrollmentId, {
      estado: 'pagado',
      pagoRef: String(paymentId),
    })

    const enrollment = await EnrollmentService.getById(enrollmentId)
    if (!enrollment) return

    const workshop = enrollment.workshopId as unknown as {
      _id: string; titulo: string; slug: string; accountId: string; precio: number
    }

    // [CUADRATURA] Crear PaymentBreakdown con desglose
    const account = await Account.findById(workshop.accountId)
    const feePct = await SiteConfigService.getComisionPct()
    const desglose = FinanceService.calcularDesglose(enrollment.monto, feePct)

    const breakdown = await new PaymentBreakdown({
      enrollmentId,
      workshopId: workshop._id,
      accountId: workshop.accountId,
      studentId: enrollment.studentId,
      montoBruto: desglose.montoBruto,
      comisionMP: 0,
      feeTallerea: desglose.feeTallerea,
      montoProfesor: desglose.montoProfesor,
      porcentajeFee: feePct,
      precioModalidad: account?.precioModalidad ?? 'bruto',
      tipo: 'pago',
      estado: 'cobrado',
      mercadoPagoId: String(paymentId),
      fechaCobro: new Date(),
    }).save()

    // Audit log
    await FinanceService.log(
      'pago_recibido',
      'PaymentBreakdown',
      String(breakdown._id),
      enrollment.monto,
      String(enrollment.studentId)
    )

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
}
