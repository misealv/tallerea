'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Workshop {
  _id: string
  titulo: string
  tipo: string
  modalidad: string
  precio: number
  cupoMax: number
  cupoDisponible: number
  activo: boolean
  slug: string
}

export default function TalleresListPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [loading, setLoading] = useState(true)

  const accountId = typeof document !== 'undefined'
    ? document.getElementById('accountId')?.getAttribute('value') || ''
    : ''

  const fetchWorkshops = useCallback(async () => {
    if (!accountId) return
    const res = await fetch(`/api/workshops?accountId=${accountId}&includeInactive=true`)
    const data = await res.json()
    setWorkshops(data.data || [])
    setLoading(false)
  }, [accountId])

  useEffect(() => { fetchWorkshops() }, [fetchWorkshops])

  async function toggleActive(id: string, currentActive: boolean) {
    await fetch(`/api/workshops/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !currentActive }),
    })
    fetchWorkshops()
  }

  const tipoLabel: Record<string, string> = {
    visual: '🎨', teatro: '🎭', danza: '💃', musica: '🎵', otro: '✨'
  }

  if (loading) return <div className="text-gray-500">Cargando talleres...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Talleres</h1>
        <Link href="/dashboard/talleres/nuevo"
          className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition">
          + Nuevo taller
        </Link>
      </div>

      {workshops.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
          No tienes talleres publicados. ¡Crea tu primer taller!
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {workshops.map((w) => (
            <div key={w._id} className="p-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{tipoLabel[w.tipo] || '✨'}</span>
                <div>
                  <p className="font-medium text-gray-900">{w.titulo}</p>
                  <p className="text-sm text-gray-500">
                    {w.modalidad} · ${w.precio.toLocaleString('es-CL')} · {w.cupoDisponible}/{w.cupoMax} cupos
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  w.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {w.activo ? 'Activo' : 'Inactivo'}
                </span>
                <Link href={`/dashboard/talleres/${w._id}/editar`}
                  className="text-sm text-purple-600 hover:underline">Editar</Link>
                <button onClick={() => toggleActive(w._id, w.activo)}
                  className="text-sm text-gray-500 hover:underline">
                  {w.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
