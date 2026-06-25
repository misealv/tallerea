'use client'

import { useState } from 'react'

export default function PagarFiadoBanner({
  subscriptionId,
  montoAdeudado,
}: {
  subscriptionId: string
  montoAdeudado: number
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pagar() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/alumno/subscriptions/${subscriptionId}/pagar-fiado`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al generar el link de pago')
      if (data.initPoint) window.location.href = data.initPoint
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar el link de pago')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-amber-800">Pago pendiente</p>
        <p className="text-xs text-amber-700 mt-0.5">
          Tienes un pago pendiente de ${montoAdeudado.toLocaleString('es-CL')}
        </p>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
      <button
        onClick={pagar}
        disabled={loading}
        className="shrink-0 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
      >
        {loading ? 'Cargando...' : 'Pagar ahora'}
      </button>
    </div>
  )
}
