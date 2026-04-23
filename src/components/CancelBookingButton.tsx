'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCancel() {
    if (!confirm('¿Cancelar esta reserva? Si está dentro del plazo, se devuelve la sesión.')) return
    setLoading(true)
    setError('')

    const res = await fetch(`/api/bookings/${bookingId}`, { method: 'DELETE' })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Error al cancelar')
      return
    }
    router.refresh()
  }

  return (
    <div className="text-right">
      <button
        onClick={handleCancel}
        disabled={loading}
        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
      >
        {loading ? 'Cancelando...' : 'Cancelar'}
      </button>
      {error && <p className="text-xs text-red-500 mt-1 max-w-[140px]">{error}</p>}
    </div>
  )
}
