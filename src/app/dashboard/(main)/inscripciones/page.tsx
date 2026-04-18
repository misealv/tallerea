'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'

interface Enrollment {
  _id: string
  workshopId: { _id: string; titulo: string; tipo: string }
  studentId: { _id: string; name: string; email: string }
  estado: string
  monto: number
  createdAt: string
}

interface Workshop {
  _id: string
  titulo: string
}

export default function InscripcionesPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [selectedWorkshop, setSelectedWorkshop] = useState('')
  const [loading, setLoading] = useState(true)

  const accountId = typeof document !== 'undefined'
    ? document.getElementById('accountId')?.getAttribute('value') || ''
    : ''

  const fetchWorkshops = useCallback(async () => {
    if (!accountId) return
    const res = await fetch(`/api/workshops?accountId=${accountId}&limit=100`)
    const data = await res.json()
    setWorkshops(data.data || [])
    if (data.data?.length > 0) {
      setSelectedWorkshop(data.data[0]._id)
    }
    setLoading(false)
  }, [accountId])

  useEffect(() => { fetchWorkshops() }, [fetchWorkshops])

  const fetchEnrollments = useCallback(async () => {
    if (!selectedWorkshop) return
    const res = await fetch(`/api/enrollments?workshopId=${selectedWorkshop}`)
    const data = await res.json()
    setEnrollments(data.data || [])
  }, [selectedWorkshop])

  useEffect(() => { fetchEnrollments() }, [fetchEnrollments])

  const estadoBadge: Record<string, string> = {
    pendiente: 'bg-yellow-100 text-yellow-700',
    pagado: 'bg-green-100 text-green-700',
    cancelado: 'bg-red-100 text-red-600',
  }

  if (loading) return <div className="text-gray-500">Cargando...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Inscripciones</h1>

      {workshops.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
          No tienes talleres. Las inscripciones aparecerán aquí cuando publiques talleres.
        </div>
      ) : (
        <>
          <div className="mb-4">
            <select
              value={selectedWorkshop}
              onChange={(e) => setSelectedWorkshop(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              {workshops.map((w) => (
                <option key={w._id} value={w._id}>{w.titulo}</option>
              ))}
            </select>
          </div>

          {enrollments.length === 0 ? (
            <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
              No hay inscripciones para este taller.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="p-4 border-b border-gray-100">
                <p className="text-sm text-gray-500">{enrollments.length} inscripciones</p>
              </div>
              <div className="divide-y divide-gray-100">
                {enrollments.map((e) => (
                  <div key={e._id} className="p-4 flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900">{e.studentId?.name || 'Sin nombre'}</p>
                      <p className="text-sm text-gray-500">{e.studentId?.email || ''}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-600">${e.monto.toLocaleString('es-CL')}</span>
                      <span className={`text-xs px-2 py-1 rounded-full ${estadoBadge[e.estado] || 'bg-gray-100 text-gray-500'}`}>
                        {e.estado}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(e.createdAt).toLocaleDateString('es-CL')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
