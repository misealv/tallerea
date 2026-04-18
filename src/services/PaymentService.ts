import { EnrollmentService } from '@/services/EnrollmentService'
import { WorkshopService } from '@/services/WorkshopService'
import { createPaymentPreference } from '@/lib/mercadopago'
import { sendEnrollmentConfirmation } from '@/lib/resend'

interface CreatePaymentResult {
  free?: boolean
  enrollmentId: string
  preferenceId?: string | null
  initPoint?: string | null
}

export const PaymentService = {

  /**
   * Crea inscripción + preferencia de pago (o marca pagado si es gratis)
   */
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

  /**
   * Procesa pago aprobado: actualiza enrollment + envía email
   */
  async handleApprovedPayment(enrollmentId: string, paymentId: string): Promise<void> {
    await EnrollmentService.update(enrollmentId, {
      estado: 'pagado',
      pagoRef: String(paymentId),
    })

    // Enviar email de confirmación
    try {
      const enrollment = await EnrollmentService.getById(enrollmentId)
      if (enrollment) {
        const student = enrollment.studentId as unknown as { name: string; email: string }
        const workshop = enrollment.workshopId as unknown as { titulo: string; slug: string }
        await sendEnrollmentConfirmation({
          studentName: student.name,
          studentEmail: student.email,
          workshopTitle: workshop.titulo,
          workshopSlug: workshop.slug,
          monto: enrollment.monto,
        })
      }
    } catch {
      // No bloquear el flujo por fallo de email
    }
  },
}
