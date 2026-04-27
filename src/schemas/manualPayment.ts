import { z } from 'zod'

const objectIdRegex = /^[0-9a-fA-F]{24}$/

export const ManualPaymentCreateSchema = z.object({
  studentId:      z.string().regex(objectIdRegex, 'studentId inválido'),
  dependentId:    z.string().regex(objectIdRegex, 'dependentId inválido').optional(),
  workshopId:     z.string().regex(objectIdRegex, 'workshopId inválido'),
  enrollmentId:   z.string().regex(objectIdRegex, 'enrollmentId inválido').optional(),
  subscriptionId: z.string().regex(objectIdRegex, 'subscriptionId inválido').optional(),
  monto:          z.number().int('El monto debe ser un entero CLP').nonnegative('El monto no puede ser negativo'),
  metodoPago:     z.enum(['transferencia', 'efectivo', 'otro']),
  fecha:          z.string().refine(s => {
                    const d = new Date(s)
                    if (isNaN(d.getTime())) return false
                    // No permitir fechas en el futuro (con margen de 1 día por timezone)
                    return d.getTime() <= Date.now() + 24 * 60 * 60 * 1000
                  }, 'fecha inválida o futura'),
  comprobanteUrl: z.string().url('URL inválida').optional(),
  notas:          z.string().max(500).optional(),
}).strict()

export type ManualPaymentCreateInput = z.infer<typeof ManualPaymentCreateSchema>
