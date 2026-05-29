'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  enrollmentId: string
  asistioActual: boolean | null | undefined
}

export default function MarcaAsistenciaEnrollmentButton({ enrollmentId, asistioActual }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function marcar(valor: boolean) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/enrollments/${enrollmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asistio: valor }),
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

  if (asistioActual === true)
    return (
      <button
        onClick={() => marcar(false)}
        disabled={loading}
        className="text-xs text-green-600 font-medium hover:text-green-800 disabled:opacity-50"
        title="Haz clic para desmarcar"
      >
        ✓ Asistió
      </button>
    )

  if (asistioActual === false)
    return (
      <button
        onClick={() => marcar(true)}
        disabled={loading}
        className="text-xs text-red-500 font-medium hover:text-red-700 disabled:opacity-50"
        title="Haz clic para desmarcar"
      >
        ✗ No asistió
      </button>
    )

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => marcar(true)}
        disabled={loading}
        className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
      >
        Asistió
      </button>
      <button
        onClick={() => marcar(false)}
        disabled={loading}
        className="text-xs px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50"
      >
        No asistió
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
