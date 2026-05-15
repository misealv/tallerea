import { z } from 'zod'

// Sub-schema de clases prepagadas (reutilizado por inscripción base y por cada dependiente)
export const ClasesPrepagadasSchema = z.object({
  cantidad:              z.number().int().min(1),
  consumidasAlInscribir: z.number().int().min(0).optional(), // clases ya consumidas fuera del sistema
  fechaPago:             z.coerce.date().optional(),         // opcional: se omite cuando el pago aún no ocurrió
  metodoPago:            z.string().min(1).max(80).optional(),
  montoDeclarado:        z.number().int().min(0).optional(),
  notaTallerista:        z.string().max(300).optional(),
  caducaEn:              z.coerce.date().optional(), // fecha límite de validez
}).refine(d => (d.consumidasAlInscribir ?? 0) < d.cantidad, {
  message: 'Las clases ya consumidas deben ser menores al total del paquete',
  path: ['consumidasAlInscribir'],
})

// Sub-schema de un dependiente con su propio precio y prepago (para inscripción múltiple)
export const DependientePlanSchema = z.object({
  nombre:            z.string().min(2).max(100),
  fechaNacimiento:   z.coerce.date().optional(),
  notas:             z.string().max(300).optional(),
  precioEspecial:    z.boolean(),
  precioSnapshot:    z.number().int().min(0).optional(),
  notaPrecioEspecial: z.string().max(500).optional(),
  clasesPrepagadas:  ClasesPrepagadasSchema.optional(),
}).superRefine((val, ctx) => {
  if (val.precioEspecial && val.precioSnapshot == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['precioSnapshot'],
      message: 'precioSnapshot es obligatorio cuando precioEspecial=true',
    })
  }
})

// Datos comunes a inscripción puntual y recurrente
const baseSchema = z.object({
  workshopId:      z.string().min(24).max(24),
  studentEmail:    z.string().email('Email inválido').toLowerCase(),
  studentNombre:   z.string().min(2).max(100),
  // Dependiente único (puntual) o datos base del apoderado en recurrente
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
// Soporta dos modos:
//   A) Inscripción individual (sin `dependientes`): usa los campos base dependentNombre/... + precioEspecial/...
//   B) Inscripción múltiple (con `dependientes`): array de DependientePlanSchema, ignora campos base de dependiente/precio
export const InscripcionManualRecurrenteSchema = baseSchema.extend({
  tipo:         z.literal('recurrente'),
  // Modo A — individual (deprecated cuando viene `dependientes`)
  precioEspecial: z.boolean().optional(),
  precioSnapshot: z.number().int().min(0).optional(),
  notaPrecioEspecial: z.string().max(500).optional(),
  clasesPrepagadas: ClasesPrepagadasSchema.optional(),
  // Modo B — múltiples dependientes, cada uno con su propio plan
  dependientes: z.array(DependientePlanSchema).min(1).max(10).optional(),
}).strict().superRefine((val, ctx) => {
  // En modo A (sin array), precioEspecial es obligatorio y valida snapshot
  if (!val.dependientes) {
    if (val.precioEspecial == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['precioEspecial'],
        message: 'precioEspecial es obligatorio en inscripción individual',
      })
    }
    if (val.precioEspecial && val.precioSnapshot == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['precioSnapshot'],
        message: 'precioSnapshot es obligatorio cuando precioEspecial=true',
      })
    }
  }
})

export type InscripcionManualPuntualInput    = z.infer<typeof InscripcionManualPuntualSchema>
export type InscripcionManualRecurrenteInput = z.infer<typeof InscripcionManualRecurrenteSchema>
export type DependientePlanInput             = z.infer<typeof DependientePlanSchema>
