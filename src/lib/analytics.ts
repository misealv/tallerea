'use client'

import { track } from '@vercel/analytics'

/**
 * Eventos custom de analítica del panel de alumno.
 * Centralizado para tener un único lugar donde inventariar y tipar nombres de eventos.
 */

export type TallerCardTipo = 'puntual' | 'recurrente' | 'prueba'

export function trackTallerCardClick(tipo: TallerCardTipo, slug: string): void {
  try {
    track('dashboard_taller_card_click', { tipo, slug })
  } catch {
    // Analytics no debe romper UX si falla (script bloqueado, adblocker, etc.)
  }
}

export function trackTooltipSaldoOpen(): void {
  try {
    track('tooltip_saldo_open')
  } catch {
    /* noop */
  }
}

export function trackTooltipClasesOpen(): void {
  try {
    track('tooltip_clases_open')
  } catch {
    /* noop */
  }
}
