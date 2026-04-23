'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

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

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-')
}

export default function OnboardingPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const tallerEstado = session?.user?.tallerEstado

  const [form, setForm] = useState({
    slug: '',
    bio: '',
    credenciales: '',
    especialidades: [] as string[],
    entregaMateriales: '',
    instagram: '',
    web: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function update(field: string, value: string) {
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
    setError('')
    if (form.especialidades.length === 0) {
      setError('Selecciona al menos una especialidad')
      return
    }
    setLoading(true)

    const res = await fetch('/api/taller/solicitar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: form.slug,
        bio: form.bio,
        credenciales: form.credenciales,
        especialidades: form.especialidades,
        entregaMateriales: form.entregaMateriales,
        redesSociales: {
          instagram: form.instagram || undefined,
          web: form.web || undefined,
        },
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || 'Error al enviar solicitud')
      return
    }

    router.push('/tallerista/onboarding?enviado=1')
    router.refresh()
  }

  // Estado pendiente: mostrar pantalla de espera
  if (tallerEstado === 'pendiente') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="text-5xl mb-4">⏳</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Solicitud en revisión</h1>
          <p className="text-gray-600">
            Recibimos tu solicitud y la estamos revisando. Te notificaremos por email cuando esté aprobada.
          </p>
        </div>
      </div>
    )
  }

  // Estado rechazado: mostrar razón + formulario de re-postulación
  const esRepostulacion = tallerEstado === 'rechazado'

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {esRepostulacion ? 'Re-postular como tallerista' : 'Conviértete en tallerista'}
      </h1>
      <p className="text-gray-500 text-sm mb-8">
        Completa tu perfil para que el equipo de Tallerea pueda revisar tu solicitud.
      </p>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-6">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {/* Slug */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            URL de tu perfil público
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">tallerea.cl/talleristas/</span>
            <input
              type="text"
              required
              value={form.slug}
              onChange={(e) => update('slug', slugify(e.target.value))}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="tu-nombre"
            />
          </div>
        </div>

        {/* Especialidades */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Especialidades (máx. 5)
          </label>
          <div className="flex flex-wrap gap-2">
            {ESPECIALIDADES.map(e => (
              <button
                key={e.value}
                type="button"
                onClick={() => toggleEspecialidad(e.value)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  form.especialidades.includes(e.value)
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sobre ti <span className="text-gray-400 text-xs">({form.bio.length}/2000)</span>
          </label>
          <textarea
            required
            rows={4}
            value={form.bio}
            onChange={(e) => update('bio', e.target.value)}
            maxLength={2000}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Cuéntanos quién eres, tu experiencia y lo que te apasiona enseñar..."
          />
        </div>

        {/* Credenciales */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Formación y credenciales <span className="text-gray-400 text-xs">({form.credenciales.length}/2000)</span>
          </label>
          <textarea
            required
            rows={3}
            value={form.credenciales}
            onChange={(e) => update('credenciales', e.target.value)}
            maxLength={2000}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Estudios, certificaciones, años de experiencia..."
          />
        </div>

        {/* Entrega de materiales */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ¿Qué materiales provees a tus alumnos? <span className="text-gray-400 text-xs">(opcional)</span>
          </label>
          <textarea
            rows={2}
            value={form.entregaMateriales}
            onChange={(e) => update('entregaMateriales', e.target.value)}
            maxLength={500}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Ej: Incluye arcilla y herramientas básicas..."
          />
        </div>

        {/* Redes */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
            <input
              type="url"
              value={form.instagram}
              onChange={(e) => update('instagram', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="https://instagram.com/..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sitio web</label>
            <input
              type="url"
              value={form.web}
              onChange={(e) => update('web', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="https://tuweb.cl"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 rounded-lg disabled:opacity-50 transition-colors"
        >
          {loading ? 'Enviando solicitud…' : 'Enviar solicitud'}
        </button>
      </form>
    </div>
  )
}
