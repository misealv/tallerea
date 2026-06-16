'use client'

import { useState } from 'react'

interface Props {
  subscriptionId: string
  precio: number
  clasesCantidad: number
}

// Botón self-service del alumno: renueva al precio acordado y redirige a MercadoPago.
// No requiere intervención del tallerista. Usa el endpoint /renovar-acordado.
export default function RenovarAcordadoButton({
  subscriptionId,
  precio,
  clasesCantidad,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleRenovar() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/subscriptions/${subscriptionId}/renovar-acordado`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok || !data.initPoint) {
        setError(data.error ?? 'No se pudo generar el pago')
        setLoading(false)
        return
      }
      // Redirigir a MercadoPago para completar el pago
      window.location.href = data.initPoint
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleRenovar}
        disabled={loading}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 disabled:opacity-60"
      >
        {loading
          ? 'Redirigiendo…'
          : `Renovar ${clasesCantidad} clases — $${precio.toLocaleString('es-CL')}`}
      </button>
      {error && <p className="text-xs text-red-600 leading-tight">{error}</p>}
    </div>
  )
}
