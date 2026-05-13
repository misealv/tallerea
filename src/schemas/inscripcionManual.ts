import { z } from 'zod'

// Datos comunes a inscripción puntual y recurrente
const baseSchema = z.object({
  workshopId:      z.string().min(24).max(24),
  studentEmail:    z.string().email('Email inválido').toLowerCase(),
  studentNombre:   z.string().min(2).max(100),
  // Dependiente opcional
  dependentNombre:          z.string().min(2).max(100).optional(),
  dependentFechaNacimiento: z.coerce.date().optional(),
  dependentNotas:           z.string().max(300).optional(),
  notaTallerista: z.string().max(500).optional(),
})

// Inscripción puntual (Enrollment)
export const InscripcionManualPuntualSchema = baseSchema.extend({
  tipo:        z.literal('puntual'),
  slotIndex:   z.number().int().min(0).nullable(),
  montoPagado: z.number().int().min(0),
}).strict()

// Inscripción recurrente (Subscription)
export const InscripcionManualRecurrenteSchema = baseSchema.extend({
  tipo:         z.literal('recurrente'),
  precioEspecial: z.boolean(),
  precioSnapshot: z.number().int().min(0).optional(),
  notaPrecioEspecial: z.string().max(500).optional(),
  clasesPrepagadas: z.object({
    cantidad:              z.number().int().min(1),
    consumidasAlInscribir: z.number().int().min(0).optional(), // clases ya consumidas fuera del sistema
    fechaPago:             z.coerce.date(),
    metodoPago:            z.string().min(1).max(80),
    montoDeclarado:        z.number().int().min(0).optional(),
    notaTallerista:        z.string().max(300).optional(),
    caducaEn:              z.coerce.date().optional(),  // fecha límite de validez
  }).refine(d => (d.consumidasAlInscribir ?? 0) < d.cantidad, {
    message: 'Las clases ya consumidas deben ser menores al total del paquete',
    path: ['consumidasAlInscribir'],
  }).optional(),
}).strict().superRefine((val, ctx) => {
  if (val.precioEspecial && val.precioSnapshot == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['precioSnapshot'],
      message: 'precioSnapshot es obligatorio cuando precioEspecial=true',
    })
  }
})

export type InscripcionManualPuntualInput  = z.infer<typeof InscripcionManualPuntualSchema>
export type InscripcionManualRecurrenteInput = z.infer<typeof InscripcionManualRecurrenteSchema>
