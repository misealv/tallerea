'use client'

import { trackTooltipSaldoOpen } from '@/lib/analytics'

/**
 * Botón "?" del tooltip de saldo a favor en el dashboard del alumno.
 * Sub-componente client para registrar `tooltip_saldo_open` sin tener que
 * convertir la página entera a client.
 */
export default function SaldoTooltipButton() {
  return (
    <button
      type="button"
      onMouseEnter={trackTooltipSaldoOpen}
      onFocus={trackTooltipSaldoOpen}
      className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-100 text-green-700 text-sm font-bold cursor-help select-none hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-400 transition-colors"
      aria-label="¿Qué es el saldo a favor?"
    >?</button>
  )
}
