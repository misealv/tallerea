/** Lógica centralizada de display para suscripciones — evita duplicar cálculos en vistas del tallerista y alumno. */

export interface SubViewInput {
  sesionesUsadas: number
  sesionesTotales: number
  sesionesDisponibles: number
  fechaVencimiento: Date
  clasesPrepagadas?: { cantidad: number; consumidas: number; caducaEn?: Date }
}

export interface SubViewInfo {
  /** Sesiones que el alumno puede reservar hoy */
  disponibles: number
  /** Sesiones ya consumidas */
  usadas: number
  /** Total del paquete activo (prepagado o regular) */
  totales: number
  /** Fecha real de vigencia: caducaEn si hay prepago con saldo, sino fechaVencimiento */
  fechaVigenciaReal: Date
  /** True si hay un paquete prepagado con saldo disponible */
  prepaidActivo: boolean
  /** Etiqueta unificada de sesiones: "30 disp. · 0/30" */
  etiquetaSesiones: string
  /** Fecha de vigencia real formateada en es-CL */
  vigenciaDateStr: string
}

/**
 * Calcula la información de display de una suscripción.
 * Fuente de verdad única para todas las vistas (sidebar inscritos, tarjeta taller, dashboard alumno).
 *
 * Regla de vigencia:
 *   - Si clasesPrepagadas activo (consumidas < cantidad) y tiene caducaEn → usar caducaEn
 *   - En cualquier otro caso → usar fechaVencimiento
 *
 * Esta misma regla es la que usa el cron vencer-suscripciones al decidir si cerrar el ciclo.
 */
export function getSubViewInfo(sub: SubViewInput): SubViewInfo {
  const prepaid = sub.clasesPrepagadas
  // [FIX] `sesionesDisponibles`/`sesionesUsadas` son la ÚNICA fuente de verdad
  // atómica (movida por consumeSesion/devolverSesion en cada Booking).
  // `clasesPrepagadas.consumidas` es metadata histórica que puede desincronizarse:
  //   - Si la sub se creó sin clasesPrepagadas y se agregaron después
  //   - Si la sub se inscribió con consumidasAlInscribir > 0 (clases previas en papel)
  // Por eso NO se usa para calcular disponibles. Solo aporta caducaEn y total visual.
  const prepaidActivo = !!prepaid && sub.sesionesDisponibles > 0
  const disponibles = sub.sesionesDisponibles
  const usadas = sub.sesionesUsadas
  const totales = prepaid ? prepaid.cantidad : sub.sesionesTotales
  const fechaVigenciaReal =
    prepaidActivo && prepaid!.caducaEn
      ? new Date(prepaid!.caducaEn)
      : new Date(sub.fechaVencimiento)
  return {
    disponibles,
    usadas,
    totales,
    fechaVigenciaReal,
    prepaidActivo,
    etiquetaSesiones: `${disponibles} disp. · ${usadas}/${totales}`,
    vigenciaDateStr: fechaVigenciaReal.toLocaleDateString('es-CL'),
  }
}
