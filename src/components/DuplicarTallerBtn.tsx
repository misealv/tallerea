'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DuplicarTallerBtn({ id, titulo }: { id: string; titulo: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDuplicar() {
    if (!confirm(`¿Duplicar "${titulo}"?\nSe creará un borrador inactivo con la misma configuración (sin fechas/slots).`)) return
    setLoading(true)
    try {
      const res = await fetch(`/api/tallerista/talleres/${id}/duplicar`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al duplicar')
      router.push(`/tallerista/talleres/${data.id}/editar`)
      router.refresh()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al duplicar')
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDuplicar}
      disabled={loading}
      className="text-xs text-sky-600 hover:text-sky-800 font-medium disabled:opacity-50"
    >
      {loading ? 'Duplicando…' : 'Duplicar'}
    </button>
  )
}
