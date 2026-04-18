'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CancelButton({ enrollmentId }: { enrollmentId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleCancel = async () => {
    if (!confirm('¿Estás seguro de cancelar esta inscripción?')) return
    setLoading(true)
    try {
      await fetch(`/api/enrollments/${enrollmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'cancelado' }),
      })
      router.refresh()
    } catch {
      alert('Error al cancelar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleCancel}
      disabled={loading}
      className="text-sm text-red-600 hover:text-red-700 hover:underline disabled:text-gray-400"
    >
      {loading ? 'Cancelando...' : 'Cancelar inscripción'}
    </button>
  )
}
