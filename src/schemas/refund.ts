import { z } from 'zod'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ObjectId inválido')

export const RefundCreateSchema = z.object({
  userId:         objectId,
  monto:          z.number().int().positive(),
  origenTipo:     z.enum(['reembolso', 'compensacion', 'admin']),
  enrollmentId:   objectId.optional(),
  subscriptionId: objectId.optional(),
  motivo:         z.string().min(3).max(500),
}).strict()

export type RefundCreateInput = z.infer<typeof RefundCreateSchema>
