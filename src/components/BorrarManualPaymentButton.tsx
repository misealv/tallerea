'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  id: string
}

export default function BorrarManualPaymentButton({ id }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tallerista/manual-payments/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? 'Error al borrar')
        return
      }
      router.refresh()
    } catch {
      alert('Error de red')
    } finally {
      setLoading(false)
      setConfirmando(false)
    }
  }

  if (confirmando) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-xs text-gray-600">¿Borrar?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-xs bg-red-600 text-white px-2 py-0.5 rounded hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? '…' : 'Sí'}
        </button>
        <button
          onClick={() => setConfirmando(false)}
          disabled={loading}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          No
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirmando(true)}
      title="Borrar registro"
      className="text-xs text-red-500 hover:text-red-700 hover:underline transition-colors"
    >
      Borrar
    </button>
  )
}
