'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'

interface Review {
  _id: string
  rating: number
  comentario: string
  publicado: boolean
  createdAt: string
  studentId: { name: string; email: string } | null
  workshopId: { titulo: string; slug: string } | null
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s <= rating ? 'text-yellow-400' : 'text-gray-200'}>★</span>
      ))}
    </span>
  )
}

export default function AdminResenasPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'todas' | 'publicadas' | 'ocultas'>('todas')
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/reviews')
      .then((r) => r.json())
      .then((data) => { setReviews(data); setLoading(false) })
  }, [])

  async function togglePublicado(id: string) {
    setToggling(id)
    const res = await fetch(`/api/admin/reviews/${id}`, { method: 'PATCH' })
    if (res.ok) {
      const { publicado } = await res.json()
      setReviews((prev) => prev.map((r) => r._id === id ? { ...r, publicado } : r))
    }
    setToggling(null)
  }

  const filtradas = reviews.filter((r) => {
    if (filtro === 'publicadas') return r.publicado
    if (filtro === 'ocultas') return !r.publicado
    return true
  })

  const promedio = reviews.length
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
    : '—'

  if (loading) return <div className="text-gray-500">Cargando reseñas...</div>

  return (
    <div>
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Reseñas
          <span className="ml-2 text-sm font-normal text-gray-400">({reviews.length} total)</span>
        </h1>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="text-yellow-400 text-lg">★</span>
          <span className="font-semibold text-gray-700">{promedio}</span>
          <span>promedio</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4">
        {(['todas', 'publicadas', 'ocultas'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`text-sm px-3 py-1.5 rounded-full border transition-colors capitalize ${
              filtro === f
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-purple-400'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtradas.length === 0 && (
        <p className="text-gray-400 text-sm py-8 text-center">Sin reseñas {filtro !== 'todas' ? `${filtro}` : ''}.</p>
      )}

      {/* Tabla — desktop */}
      {filtradas.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3">Alumno</th>
                  <th className="px-4 py-3">Taller</th>
                  <th className="px-4 py-3">Rating</th>
                  <th className="px-4 py-3">Comentario</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtradas.map((r) => (
                  <tr key={r._id} className={!r.publicado ? 'opacity-50' : ''}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.studentId?.name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{r.studentId?.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[180px]">
                      <span className="line-clamp-2">{r.workshopId?.titulo ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Stars rating={r.rating} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[260px]">
                      <span className="line-clamp-2 text-xs">{r.comentario}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleDateString('es-CL')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        r.publicado
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {r.publicado ? 'Publicada' : 'Oculta'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => togglePublicado(r._id)}
                        disabled={toggling === r._id}
                        className="text-xs text-purple-600 hover:underline disabled:opacity-40"
                      >
                        {toggling === r._id ? '...' : r.publicado ? 'Ocultar' : 'Publicar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards — mobile */}
          <div className="md:hidden divide-y divide-gray-100">
            {filtradas.map((r) => (
              <div key={r._id} className={`p-4 ${!r.publicado ? 'opacity-50' : ''}`}>
                <div className="flex justify-between items-start mb-1">
                  <p className="font-medium text-gray-900 text-sm">{r.studentId?.name ?? '—'}</p>
                  <Stars rating={r.rating} />
                </div>
                <p className="text-xs text-gray-500 mb-1">{r.workshopId?.titulo ?? '—'}</p>
                <p className="text-xs text-gray-400 line-clamp-3 mb-2">{r.comentario}</p>
                <div className="flex justify-between items-center">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    r.publicado ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {r.publicado ? 'Publicada' : 'Oculta'}
                  </span>
                  <button
                    onClick={() => togglePublicado(r._id)}
                    disabled={toggling === r._id}
                    className="text-xs text-purple-600 hover:underline disabled:opacity-40"
                  >
                    {toggling === r._id ? '...' : r.publicado ? 'Ocultar' : 'Publicar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
