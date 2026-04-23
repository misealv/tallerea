'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  bookingId: string
  estadoActual: string
}

export default function MarcaAsistenciaButton({ bookingId, estadoActual }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function marcar(nuevoEstado: 'asistio' | 'no_asistio') {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
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

  if (estadoActual === 'asistio') return <span className="text-xs text-green-600 font-medium">✓ Asistió</span>
  if (estadoActual === 'no_asistio') return <span className="text-xs text-red-500 font-medium">✗ No asistió</span>

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => marcar('asistio')} disabled={loading}
        className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50">
        Asistió
      </button>
      <button onClick={() => marcar('no_asistio')} disabled={loading}
        className="text-xs px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50">
        No asistió
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
