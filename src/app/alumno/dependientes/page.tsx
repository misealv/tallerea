'use client'

import { useEffect, useState } from 'react'

interface Dependent {
  _id: string
  nombre: string
  fechaNacimiento?: string
  notas?: string
  activo: boolean
}

interface FormState {
  nombre: string
  fechaNacimiento: string
  notas: string
}

const EMPTY_FORM: FormState = { nombre: '', fechaNacimiento: '', notas: '' }

function formatFecha(iso?: string) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function DependientesPage() {
  const [dependents, setDependents] = useState<Dependent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Formulario nueva ficha
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Edición
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM)
  const [editError, setEditError] = useState('')

  // Eliminación
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ─── Carga inicial ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/users/me/dependents')
      .then(r => r.json())
      .then((data: Dependent[] | { error: string }) => {
        if (Array.isArray(data)) setDependents(data)
        else setError((data as { error: string }).error)
      })
      .catch(() => setError('Error al cargar dependientes'))
      .finally(() => setLoading(false))
  }, [])

  // ─── Agregar ─────────────────────────────────────────────────────────────
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim()) { setFormError('El nombre es obligatorio'); return }
    setSaving(true); setFormError('')
    try {
      const res = await fetch('/api/users/me/dependents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          fechaNacimiento: form.fechaNacimiento || null,
          notas: form.notas.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error ?? 'Error al guardar'); return }
      setDependents(prev => [...prev, data as Dependent])
      setForm(EMPTY_FORM)
      setShowForm(false)
    } catch {
      setFormError('Error de red')
    } finally {
      setSaving(false)
    }
  }

  // ─── Editar ───────────────────────────────────────────────────────────────
  function startEdit(dep: Dependent) {
    setEditingId(dep._id)
    setEditForm({
      nombre: dep.nombre,
      fechaNacimiento: dep.fechaNacimiento ? dep.fechaNacimiento.slice(0, 10) : '',
      notas: dep.notas ?? '',
    })
    setEditError('')
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId) return
    if (!editForm.nombre.trim()) { setEditError('El nombre es obligatorio'); return }
    setSaving(true); setEditError('')
    try {
      const res = await fetch(`/api/users/me/dependents/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: editForm.nombre.trim(),
          fechaNacimiento: editForm.fechaNacimiento || null,
          notas: editForm.notas.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setEditError(data.error ?? 'Error al actualizar'); return }
      setDependents(prev => prev.map(d => d._id === editingId ? (data as Dependent) : d))
      setEditingId(null)
    } catch {
      setEditError('Error de red')
    } finally {
      setSaving(false)
    }
  }

  // ─── Eliminar ─────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/users/me/dependents/${id}`, { method: 'DELETE' })
      if (res.ok) setDependents(prev => prev.filter(d => d._id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) return <div className="py-12 text-center text-gray-400">Cargando...</div>

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mis dependientes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Agrega personas que asisten a los talleres bajo tu cuenta (hijos, familiares, etc.).
        </p>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {/* Lista */}
      {dependents.length === 0 && !showForm && (
        <p className="text-sm text-gray-400">Aún no tienes dependientes registrados.</p>
      )}

      <div className="space-y-3">
        {dependents.map(dep => (
          <div key={dep._id} className="bg-white border border-gray-200 rounded-xl px-5 py-4">
            {editingId === dep._id ? (
              <form onSubmit={handleUpdate} className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                    value={editForm.nombre}
                    onChange={e => setEditForm(p => ({ ...p, nombre: e.target.value }))}
                    maxLength={100}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fecha de nacimiento</label>
                  <input
                    type="date"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                    value={editForm.fechaNacimiento}
                    onChange={e => setEditForm(p => ({ ...p, fechaNacimiento: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Notas</label>
                  <textarea
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
                    value={editForm.notas}
                    onChange={e => setEditForm(p => ({ ...p, notas: e.target.value }))}
                    rows={2}
                    maxLength={500}
                  />
                </div>
                {editError && <p className="text-red-500 text-xs">{editError}</p>}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-purple-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                  >
                    {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-sm text-gray-500 hover:text-gray-700 px-2"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">{dep.nombre}</p>
                  {dep.fechaNacimiento && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Nació el {formatFecha(dep.fechaNacimiento)}
                    </p>
                  )}
                  {dep.notas && (
                    <p className="text-xs text-gray-500 mt-1 italic">{dep.notas}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => startEdit(dep)}
                    className="text-xs text-purple-600 hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(dep._id)}
                    disabled={deletingId === dep._id}
                    className="text-xs text-red-500 hover:underline disabled:opacity-50"
                  >
                    {deletingId === dep._id ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Formulario nuevo */}
      {showForm ? (
        <form onSubmit={handleAdd} className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Nuevo dependiente</h3>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="Ej: Juan Pablo"
              value={form.nombre}
              onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
              maxLength={100}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fecha de nacimiento</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              value={form.fechaNacimiento}
              onChange={e => setForm(p => ({ ...p, fechaNacimiento: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notas</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
              placeholder="Alergias, necesidades especiales, etc."
              value={form.notas}
              onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
              rows={2}
              maxLength={500}
            />
          </div>
          {formError && <p className="text-red-500 text-xs">{formError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-purple-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Agregar'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setFormError('') }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="text-sm text-purple-700 font-semibold hover:underline"
        >
          + Agregar dependiente
        </button>
      )}
    </div>
  )
}
