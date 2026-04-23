'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  workshopId: string
  workshopSlug: string
}

export default function SuscribirseButton({ workshopId, workshopSlug }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleClick() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshopId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al procesar')
        return
      }
      if (data.free) {
        // Taller gratuito → ir directo a reservas
        router.push(`/alumno/reservas?sub=${data.subscriptionId}&workshop=${workshopSlug}`)
        return
      }
      // Redirigir a MercadoPago
      window.location.href = data.initPoint
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className="block w-full text-center bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50"
      >
        {loading ? 'Procesando…' : 'Suscribirme'}
      </button>
      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
    </div>
  )
}
