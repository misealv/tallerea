'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

interface Location {
  _id: string
  nombre: string
  direccion: string
  comuna: string
  ciudad: string
  region?: string
}

const EMPTY_FORM = { nombre: '', direccion: '', comuna: '', ciudad: '', region: '' }

export default function EspaciosPage() {
  const { data: session } = useSession()
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  async function loadLocations() {
    if (!session?.user?.id) return
    const res = await fetch(`/api/locations?ownerId=${session.user.id}`)
    const data = await res.json()
    setLocations(data.data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadLocations() }, [session?.user?.id])

  function openCreate() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setError('')
    setShowForm(true)
  }

  function openEdit(loc: Location) {
    setForm({
      nombre: loc.nombre,
      direccion: loc.direccion,
      comuna: loc.comuna,
      ciudad: loc.ciudad,
      region: loc.region ?? '',
    })
    setEditingId(loc._id)
    setError('')
    setShowForm(true)
  }

  function cancel() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim() || !form.direccion.trim() || !form.comuna.trim() || !form.ciudad.trim()) {
      setError('Nombre, dirección, comuna y ciudad son obligatorios')
      return
    }
    setSaving(true)
    setError('')

    const url = editingId ? `/api/locations/${editingId}` : '/api/locations'
    const method = editingId ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error ?? 'Error al guardar')
      return
    }

    await loadLocations()
    cancel()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este espacio? Los talleres que lo usen quedarán sin espacio asignado.')) return
    setDeleting(id)
    await fetch(`/api/locations/${id}`, { method: 'DELETE' })
    setLocations(prev => prev.filter(l => l._id !== id))
    setDeleting(null)
  }

  if (loading) return <div className="text-gray-500 text-sm">Cargando...</div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis espacios</h1>
          <p className="text-sm text-gray-500 mt-1">
            Los lugares donde dictas tus talleres. Puedes asignar un espacio a cada taller.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={openCreate}
            className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg"
          >
            + Nuevo espacio
          </button>
        )}
      </div>

      {/* Formulario crear / editar */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">
            {editingId ? 'Editar espacio' : 'Nuevo espacio'}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del espacio *</label>
              <input
                type="text"
                required
                value={form.nombre}
                onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Ej: Casona de Artes y Oficios"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Dirección *</label>
              <input
                type="text"
                required
                value={form.direccion}
                onChange={e => setForm(p => ({ ...p, direccion: e.target.value }))}
                placeholder="Ej: Av. Los Leones 1234"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Comuna *</label>
              <input
                type="text"
                required
                value={form.comuna}
                onChange={e => setForm(p => ({ ...p, comuna: e.target.value }))}
                placeholder="Ej: Ñuñoa"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad *</label>
              <input
                type="text"
                required
                value={form.ciudad}
                onChange={e => setForm(p => ({ ...p, ciudad: e.target.value }))}
                placeholder="Ej: Santiago"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Región</label>
              <input
                type="text"
                value={form.region}
                onChange={e => setForm(p => ({ ...p, region: e.target.value }))}
                placeholder="Ej: Metropolitana"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg"
            >
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear espacio'}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-300"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Lista */}
      {locations.length === 0 && !showForm ? (
        <div className="text-center py-12 bg-white border border-gray-200 border-dashed rounded-xl">
          <p className="text-gray-500 text-sm">Aún no tienes espacios registrados.</p>
          <button onClick={openCreate} className="mt-3 text-purple-600 hover:underline text-sm font-medium">
            + Crear mi primer espacio
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {locations.map(loc => (
            <div
              key={loc._id}
              className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-start justify-between gap-4"
            >
              <div>
                <p className="font-semibold text-gray-900">{loc.nombre}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {loc.direccion} — {loc.comuna}, {loc.ciudad}
                  {loc.region && ` (${loc.region})`}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => openEdit(loc)}
                  className="text-xs text-gray-600 hover:text-purple-700 border border-gray-200 hover:border-purple-300 px-3 py-1.5 rounded-lg"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(loc._id)}
                  disabled={deleting === loc._id}
                  className="text-xs text-red-600 hover:text-red-700 border border-red-100 hover:border-red-300 px-3 py-1.5 rounded-lg disabled:opacity-50"
                >
                  {deleting === loc._id ? '...' : 'Eliminar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
