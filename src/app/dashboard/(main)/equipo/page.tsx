'use client'

import { useState, useEffect, useCallback } from 'react'

interface Member {
  _id: string
  nombre: string
  rol: string
  userId: { name: string; email: string }
  aceptado: boolean
}

export default function EquipoPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const accountId = typeof document !== 'undefined'
    ? document.getElementById('accountId')?.getAttribute('value') || ''
    : ''

  const fetchMembers = useCallback(async () => {
    if (!accountId) return
    const res = await fetch(`/api/accounts/${accountId}/members`)
    if (res.ok) {
      const data = await res.json()
      setMembers(data)
    }
    setLoading(false)
  }, [accountId])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const res = await fetch(`/api/accounts/${accountId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, nombre, rol: 'instructor' }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error)
      setSubmitting(false)
      return
    }

    setEmail('')
    setNombre('')
    setShowForm(false)
    setSubmitting(false)
    fetchMembers()
  }

  const rolLabel: Record<string, string> = {
    owner: 'Dueño', instructor: 'Instructor', admin_espacio: 'Administrador',
  }

  if (loading) return <div className="text-gray-500">Cargando...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Equipo</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700"
        >
          + Invitar miembro
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleInvite} className="bg-gray-50 rounded-xl p-4 mb-6 space-y-3">
          <div>
            <label className="text-sm text-gray-600 block">Nombre</label>
            <input
              type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
              required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 block">Email (debe estar registrado)</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit" disabled={submitting}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:bg-gray-300"
          >
            {submitting ? 'Invitando...' : 'Invitar'}
          </button>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {members.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No hay miembros en este espacio.
          </div>
        ) : (
          members.map((m) => (
            <div key={m._id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{m.nombre}</p>
                <p className="text-sm text-gray-500">{m.userId?.email || ''}</p>
              </div>
              <span className="text-xs bg-purple-50 text-purple-700 px-3 py-1 rounded-full">
                {rolLabel[m.rol] || m.rol}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
