import { z } from 'zod'

export const ReviewCreateSchema = z.object({
  workshopId:     z.string().min(1),
  rating:         z.number().int().min(1).max(5),
  comentario:     z.string().min(10).max(1000).trim(),
}).strict()

export type ReviewCreateInput = z.infer<typeof ReviewCreateSchema>
