'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  bookingId: string
}

export default function DecideReagendamientoButton({ bookingId }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function decidir(decision: 'aprobado' | 'rechazado') {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/reagendar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Error')
        return
      }
      router.refresh()
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => decidir('aprobado')} disabled={loading}
        className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
        Aprobar
      </button>
      <button onClick={() => decidir('rechazado')} disabled={loading}
        className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50 transition-colors">
        Rechazar
      </button>
      {error && <span className="text-xs text-red-500 ml-1">{error}</span>}
    </div>
  )
}
