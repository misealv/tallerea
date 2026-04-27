/**
 * Lógica pura de filtrado de clases de prueba para el dashboard del alumno.
 * Sin dependencias de Mongoose ni I/O — testeable en aislamiento.
 *
 * Reglas de ocultación (Fase 6):
 * 1. Si el alumno ya tiene/tuvo una suscripción (cualquier estado) al mismo taller,
 *    la prueba ya cumplió su función conversiva → ocultar.
 * 2. Si la fecha del slot (o, en su ausencia, la fecha de creación del enrollment)
 *    quedó >48h en el pasado, la prueba se considera consumida → ocultar.
 */

export const VENTANA_POST_CLASE_MS = 48 * 60 * 60 * 1000

export interface TrialFilterInput {
  workshopSlug: string | null | undefined
  slotFecha: Date | string | null | undefined
  enrollmentCreatedAt: Date | string
}

export interface TrialFilterContext {
  slugsConSubHistorica: Set<string>
  now: number
}

export function shouldHideTrial(
  input: TrialFilterInput,
  ctx: TrialFilterContext,
): boolean {
  // Sin slug → no se puede mostrar útilmente
  if (!input.workshopSlug) return true

  // Regla 1: upgrade ya ocurrió
  if (ctx.slugsConSubHistorica.has(input.workshopSlug)) return true

  // Regla 2: ventana post-clase
  const referencia = input.slotFecha
    ? new Date(input.slotFecha).getTime()
    : new Date(input.enrollmentCreatedAt).getTime()

  if (Number.isNaN(referencia)) return true

  return ctx.now - referencia > VENTANA_POST_CLASE_MS
}
