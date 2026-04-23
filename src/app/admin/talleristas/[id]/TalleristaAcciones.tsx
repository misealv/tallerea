'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  userId: string
  estado: string
}

export default function TalleristaAcciones({ userId, estado }: Props) {
  const router = useRouter()
  const [razon, setRazon] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function accion(tipo: string) {
    setError('')
    const necesitaRazon = ['rechazar', 'suspender'].includes(tipo)
    if (necesitaRazon && !razon.trim()) {
      setError('Debes indicar una razón')
      return
    }

    setLoading(tipo)
    const body = necesitaRazon ? { razon } : {}
    const res = await fetch(`/api/admin/talleristas/${userId}/${tipo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    setLoading(null)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Error al ejecutar acción')
      return
    }

    router.push('/admin/talleristas')
    router.refresh()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h3 className="font-semibold text-gray-900">Acciones</h3>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {(estado === 'pendiente' || estado === 'aprobado') && (
        <div>
          <label className="block text-sm text-gray-600 mb-1">
            Razón {estado === 'pendiente' ? '(requerida si rechazas)' : '(requerida para suspender)'}
          </label>
          <textarea
            rows={2}
            value={razon}
            onChange={e => setRazon(e.target.value)}
            placeholder="Escribe la razón (se enviará al tallerista)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {estado === 'pendiente' && (
          <>
            <button
              onClick={() => accion('aprobar')}
              disabled={loading !== null}
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
            >
              {loading === 'aprobar' ? 'Aprobando…' : '✓ Aprobar'}
            </button>
            <button
              onClick={() => accion('rechazar')}
              disabled={loading !== null}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
            >
              {loading === 'rechazar' ? 'Rechazando…' : '✕ Rechazar'}
            </button>
          </>
        )}
        {estado === 'aprobado' && (
          <button
            onClick={() => accion('suspender')}
            disabled={loading !== null}
            className="bg-gray-700 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading === 'suspender' ? 'Suspendiendo…' : 'Suspender'}
          </button>
        )}
        {estado === 'suspendido' && (
          <button
            onClick={() => accion('reactivar')}
            disabled={loading !== null}
            className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading === 'reactivar' ? 'Reactivando…' : 'Reactivar'}
          </button>
        )}
      </div>
    </div>
  )
}
