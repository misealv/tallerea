'use client'

/**
 * AutopagoNudge
 * Muestra el mensaje de incentivo del pago automático en el checkout.
 * Lee los parámetros desde /api/autopago/incentivo (SiteConfig, nunca hardcodeado).
 * Si el incentivo está desactivado desde el admin, no renderiza nada.
 */

import { useEffect, useState } from 'react'

interface Incentivo {
  activo: boolean
  descuentoPct?: number
  descuentoActivo?: boolean
  copyCheckout?: string
  autopagoPreseleccionado?: boolean
}

interface AutopagoNudgeProps {
  /** Si true, se muestra un checkbox para activar el auto-pago al suscribirse */
  mostrarCheckbox?: boolean
  /** Valor controlado del checkbox — el padre decide si está marcado */
  checked?: boolean
  onChange?: (checked: boolean) => void
  className?: string
}

export default function AutopagoNudge({
  mostrarCheckbox = false,
  checked,
  onChange,
  className = '',
}: AutopagoNudgeProps) {
  const [incentivo, setIncentivo] = useState<Incentivo | null>(null)

  useEffect(() => {
    fetch('/api/autopago/incentivo')
      .then(r => r.json())
      .then((data: Incentivo) => setIncentivo(data))
      .catch(() => setIncentivo({ activo: false }))
  }, [])

  if (!incentivo?.activo) return null

  const { descuentoPct = 0, descuentoActivo = false, copyCheckout = '' } = incentivo

  return (
    <div className={`rounded-lg border border-purple-200 bg-purple-50 p-4 ${className}`}>
      {/* Badge de descuento (solo si el descuento monetario está activo) */}
      {descuentoActivo && descuentoPct > 0 && (
        <span className="inline-block mb-2 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
          {descuentoPct}% de descuento al activar
        </span>
      )}

      {/* Copy principal desde SiteConfig */}
      {copyCheckout && (
        <p className="text-sm text-purple-800">{copyCheckout}</p>
      )}

      {/* Mensajes de confianza fijos — estos sí pueden estar en código porque son estructurales */}
      <ul className="mt-2 space-y-0.5 text-xs text-purple-600">
        <li>✓ Cancela en 1 clic, sin trámites</li>
        <li>✓ Te avisamos antes de cada cobro</li>
        <li>✓ Tu tarjeta se procesa de forma segura en MercadoPago</li>
      </ul>

      {/* Checkbox opt-in (siempre desmarcable) */}
      {mostrarCheckbox && (
        <label className="mt-3 flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={checked ?? false}
            onChange={e => onChange?.(e.target.checked)}
            className="h-4 w-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
          />
          <span className="text-sm font-medium text-purple-800">
            Activar pago automático{descuentoActivo && descuentoPct > 0 ? ` y ahorrar ${descuentoPct}%` : ''}
          </span>
        </label>
      )}
    </div>
  )
}
