'use client'

import { useState, useEffect } from 'react'

const ESPECIALIDADES = [
  { value: 'visual', label: 'Artes visuales' },
  { value: 'teatro', label: 'Teatro' },
  { value: 'danza', label: 'Danza' },
  { value: 'musica', label: 'Música' },
  { value: 'ceramica', label: 'Cerámica' },
  { value: 'yoga', label: 'Yoga / Bienestar' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'fotografia', label: 'Fotografía' },
  { value: 'escritura', label: 'Escritura' },
  { value: 'manualidades', label: 'Manualidades' },
  { value: 'otro', label: 'Otro' },
]

interface PerfilForm {
  bio: string
  credenciales: string
  especialidades: string[]
  entregaMateriales: string
  instagram: string
  web: string
  facebook: string
}

export default function TalleristaPerfilPage() {
  const [form, setForm] = useState<PerfilForm>({
    bio: '',
    credenciales: '',
    especialidades: [],
    entregaMateriales: '',
    instagram: '',
    web: '',
    facebook: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/taller/perfil')
      .then(r => r.json())
      .then(data => {
        if (data.taller) {
          const t = data.taller
          setForm({
            bio: t.bio ?? '',
            credenciales: t.credenciales ?? '',
            especialidades: t.especialidades ?? [],
            entregaMateriales: t.entregaMateriales ?? '',
            instagram: t.redesSociales?.instagram ?? '',
            web: t.redesSociales?.web ?? '',
            facebook: t.redesSociales?.facebook ?? '',
          })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function update(field: keyof PerfilForm, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function toggleEspecialidad(value: string) {
    setForm(prev => ({
      ...prev,
      especialidades: prev.especialidades.includes(value)
        ? prev.especialidades.filter(e => e !== value)
        : [...prev.especialidades, value],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess(false)

    const res = await fetch('/api/taller/perfil', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bio: form.bio,
        credenciales: form.credenciales,
        especialidades: form.especialidades,
        entregaMateriales: form.entregaMateriales,
        redesSociales: {
          instagram: form.instagram,
          web: form.web,
          facebook: form.facebook,
        },
      }),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error ?? 'Error al guardar')
    } else {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }
  }

  if (loading) {
    return <div className="text-gray-500 text-sm">Cargando...</div>
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi perfil público</h1>
        <p className="text-sm text-gray-500 mt-1">
          Esta información es visible para los alumnos en la página de tus talleres.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Biografía */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Biografía <span className="text-gray-400 font-normal">(mín. 20 caracteres)</span>
          </label>
          <textarea
            rows={5}
            required
            minLength={20}
            maxLength={2000}
            value={form.bio}
            onChange={e => update('bio', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-vertical"
            placeholder="Cuéntanos sobre ti, tu experiencia artística y tu metodología de enseñanza..."
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{form.bio.length}/2000</p>
        </div>

        {/* Credenciales */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Formación y credenciales <span className="text-gray-400 font-normal">(mín. 10 caracteres)</span>
          </label>
          <textarea
            rows={4}
            required
            minLength={10}
            maxLength={2000}
            value={form.credenciales}
            onChange={e => update('credenciales', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-vertical"
            placeholder="Estudios, certificaciones, años de experiencia..."
          />
        </div>

        {/* Especialidades */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Especialidades <span className="text-gray-400 font-normal">(selecciona hasta 5)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {ESPECIALIDADES.map(e => (
              <button
                key={e.value}
                type="button"
                onClick={() => toggleEspecialidad(e.value)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  form.especialidades.includes(e.value)
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-purple-400'
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
          {form.especialidades.length === 0 && (
            <p className="text-xs text-red-500 mt-1">Selecciona al menos una especialidad</p>
          )}
        </div>

        {/* Entrega de materiales */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Materiales que provees <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <textarea
            rows={2}
            maxLength={500}
            value={form.entregaMateriales}
            onChange={e => update('entregaMateriales', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Ej: Proveo pinceles, pinturas y telas. Los alumnos traen su delantal."
          />
        </div>

        {/* Redes sociales */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Redes sociales <span className="text-gray-400 font-normal">(opcionales)</span>
          </label>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm w-24">Instagram</span>
            <input
              type="url"
              value={form.instagram}
              onChange={e => update('instagram', e.target.value)}
              placeholder="https://instagram.com/..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm w-24">Sitio web</span>
            <input
              type="url"
              value={form.web}
              onChange={e => update('web', e.target.value)}
              placeholder="https://..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm w-24">Facebook</span>
            <input
              type="url"
              value={form.facebook}
              onChange={e => update('facebook', e.target.value)}
              placeholder="https://facebook.com/..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
        )}

        {success && (
          <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded">
            ✓ Perfil actualizado correctamente
          </p>
        )}

        <button
          type="submit"
          disabled={saving || form.especialidades.length === 0}
          className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm px-6 py-2.5 rounded-lg font-medium transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  )
}
