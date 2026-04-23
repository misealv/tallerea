'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  subscriptionId: string
  workshopId: string
  slotIndex: number
  disabled?: boolean
}

export default function ReservarSlotButton({ subscriptionId, workshopId, slotIndex, disabled }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleReservar() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId, workshopId, slotIndex }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Error al reservar')
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
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleReservar}
        disabled={loading || disabled}
        className="px-4 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Reservando…' : 'Reservar'}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
