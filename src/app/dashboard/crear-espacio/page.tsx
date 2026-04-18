'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

export default function CrearEspacioPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [form, setForm] = useState({ nombre: '', tipo: 'individual' as const, bio: '', especialidades: [] as string[] })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (status === 'loading') return <div className="min-h-screen flex items-center justify-center">Cargando...</div>
  if (!session) { router.push('/login'); return null }

  const especialidadesOpts = [
    { value: 'visual', label: '🎨 Artes Visuales' },
    { value: 'teatro', label: '🎭 Teatro' },
    { value: 'danza', label: '💃 Danza' },
    { value: 'musica', label: '🎵 Música' },
    { value: 'otro', label: '✨ Otro' },
  ]

  function toggleEsp(val: string) {
    setForm((prev) => ({
      ...prev,
      especialidades: prev.especialidades.includes(val)
        ? prev.especialidades.filter((e) => e !== val)
        : [...prev.especialidades, val],
    }))
  }

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || 'Error al crear espacio')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Crear tu espacio</h1>
        <p className="text-gray-500 text-sm mb-6">Configura tu perfil como tallerista o institución.</p>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">¿Qué tipo de espacio eres?</label>
            <div className="grid grid-cols-2 gap-3">
              {(['individual', 'institucion'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => update('tipo', t)}
                  className={`p-4 border-2 rounded-lg text-center transition ${
                    form.tipo === t ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">{t === 'individual' ? '👤' : '🏛️'}</div>
                  <div className="font-medium text-sm">{t === 'individual' ? 'Tallerista' : 'Institución'}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="nombre" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del espacio
            </label>
            <input
              id="nombre"
              type="text"
              required
              value={form.nombre}
              onChange={(e) => update('nombre', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder={form.tipo === 'individual' ? 'Ej: María López — Cerámica' : 'Ej: Casona de Artes y Oficios'}
            />
          </div>

          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
              Descripción breve
            </label>
            <textarea
              id="bio"
              rows={3}
              value={form.bio}
              onChange={(e) => update('bio', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Cuéntanos sobre tu espacio o tu trabajo como tallerista..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Especialidades</label>
            <div className="flex flex-wrap gap-2">
              {especialidadesOpts.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleEsp(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition ${
                    form.especialidades.includes(opt.value)
                      ? 'bg-purple-100 border-purple-400 text-purple-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 text-white py-2.5 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition"
          >
            {loading ? 'Creando...' : 'Crear espacio'}
          </button>
        </form>
      </div>
    </div>
  )
}
