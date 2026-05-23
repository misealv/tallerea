'use client'

import { useState } from 'react'

interface Paquete {
  _id: string
  nombre: string
  precio: number
  sesionesIncluidas: number
  duracionDias: number
}

interface Props {
  subscriptionId: string
  paquete: Paquete
}

export default function RecargarPaqueteButton({ subscriptionId, paquete }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/subscriptions/${subscriptionId}/recargar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paqueteId: paquete._id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al generar pago')
      if (!data.initPoint) throw new Error('No se recibió link de pago')
      window.location.href = data.initPoint
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-lg transition"
      >
        {loading ? 'Generando link…' : `Pagar $${paquete.precio.toLocaleString('es-CL')}`}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
