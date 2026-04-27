import { z } from 'zod'

export const ManualPaymentCreateSchema = z.object({
  studentId:      z.string().min(1, 'studentId requerido'),
  dependentId:    z.string().optional(),
  workshopId:     z.string().min(1, 'workshopId requerido'),
  enrollmentId:   z.string().optional(),
  subscriptionId: z.string().optional(),
  monto:          z.number().int('El monto debe ser un entero CLP').nonnegative('El monto no puede ser negativo'),
  metodoPago:     z.enum(['transferencia', 'efectivo', 'otro']),
  fecha:          z.string().min(1, 'fecha requerida'), // ISO string, se convierte a Date en el service
  comprobanteUrl: z.string().url('URL inválida').optional(),
  notas:          z.string().max(500).optional(),
})

export type ManualPaymentCreateInput = z.infer<typeof ManualPaymentCreateSchema>
