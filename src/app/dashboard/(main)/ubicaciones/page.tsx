'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'

interface Location {
  _id: string
  nombre: string
  direccion: string
  comuna: string
  ciudad: string
  region?: string
}

export default function UbicacionesPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ nombre: '', direccion: '', comuna: '', ciudad: '', region: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const accountId = typeof document !== 'undefined'
    ? document.getElementById('accountId')?.getAttribute('value') || ''
    : ''

  const fetchLocations = useCallback(async () => {
    if (!accountId) return
    const res = await fetch(`/api/locations?accountId=${accountId}`)
    const data = await res.json()
    setLocations(data.data || [])
    setLoading(false)
  }, [accountId])

  useEffect(() => { fetchLocations() }, [fetchLocations])

  function resetForm() {
    setForm({ nombre: '', direccion: '', comuna: '', ciudad: '', region: '' })
    setEditingId(null)
    setShowForm(false)
    setError('')
  }

  function startEdit(loc: Location) {
    setForm({ nombre: loc.nombre, direccion: loc.direccion, comuna: loc.comuna, ciudad: loc.ciudad, region: loc.region || '' })
    setEditingId(loc._id)
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const url = editingId ? `/api/locations/${editingId}` : '/api/locations'
    const method = editingId ? 'PUT' : 'POST'
    const body = editingId ? form : { ...form, accountId }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error || 'Error al guardar')
      return
    }

    resetForm()
    fetchLocations()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Desactivar esta ubicación?')) return
    await fetch(`/api/locations/${id}`, { method: 'DELETE' })
    fetchLocations()
  }

  if (loading) return <div className="text-gray-500">Cargando ubicaciones...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ubicaciones</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition"
        >
          + Nueva ubicación
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">
            {editingId ? 'Editar ubicación' : 'Nueva ubicación'}
          </h2>
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              required placeholder="Nombre (ej: Sede Providencia)" value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <input
              required placeholder="Dirección" value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <input
              required placeholder="Comuna" value={form.comuna}
              onChange={(e) => setForm({ ...form, comuna: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <input
              required placeholder="Ciudad" value={form.ciudad}
              onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <input
              placeholder="Región (opcional)" value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <div className="flex gap-2 items-end">
              <button type="submit" disabled={saving}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition">
                {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}
              </button>
              <button type="button" onClick={resetForm}
                className="px-4 py-2 rounded-lg text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {locations.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
          No tienes ubicaciones. Crea una para poder publicar talleres presenciales.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {locations.map((loc) => (
            <div key={loc._id} className="p-4 flex justify-between items-center">
              <div>
                <p className="font-medium text-gray-900">{loc.nombre}</p>
                <p className="text-sm text-gray-500">{loc.direccion}, {loc.comuna}, {loc.ciudad}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(loc)}
                  className="text-sm text-purple-600 hover:underline">Editar</button>
                <button onClick={() => handleDelete(loc._id)}
                  className="text-sm text-red-500 hover:underline">Desactivar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
