'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

const tipos = [
  { value: '', label: 'Todos' },
  { value: 'visual', label: '🎨 Visual' },
  { value: 'teatro', label: '🎭 Teatro' },
  { value: 'danza', label: '💃 Danza' },
  { value: 'musica', label: '🎵 Música' },
  { value: 'ceramica', label: '🏺 Cerámica' },
  { value: 'yoga', label: '🧘 Yoga' },
  { value: 'cocina', label: '👨‍🍳 Cocina' },
  { value: 'manualidades', label: '✂️ Manualidades' },
  { value: 'fotografia', label: '📸 Fotografía' },
  { value: 'escritura', label: '✍️ Escritura' },
  { value: 'bienestar', label: '🌿 Bienestar' },
  { value: 'tecnologia', label: '💻 Tecnología' },
  { value: 'idiomas', label: '🌎 Idiomas' },
  { value: 'infantil', label: '🧒 Infantil' },
]

const modalidades = [
  { value: '', label: 'Todas' },
  { value: 'presencial', label: 'Presencial' },
  { value: 'online', label: 'Online' },
  { value: 'hibrido', label: 'Híbrido' },
]

const dias = [
  { value: '', label: 'Cualquier día' },
  { value: 'lunes', label: 'Lunes' },
  { value: 'martes', label: 'Martes' },
  { value: 'miercoles', label: 'Miércoles' },
  { value: 'jueves', label: 'Jueves' },
  { value: 'viernes', label: 'Viernes' },
  { value: 'sabado', label: 'Sábado' },
  { value: 'domingo', label: 'Domingo' },
]

export default function SearchFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const current = {
    tipo: searchParams.get('tipo') || '',
    modalidad: searchParams.get('modalidad') || '',
    dia: searchParams.get('dia') || '',
    comuna: searchParams.get('comuna') || '',
    precioMax: searchParams.get('precioMax') || '',
  }

  const updateFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    // Resetear página al cambiar filtros
    params.delete('page')
    router.push(`/talleres?${params.toString()}`)
  }, [router, searchParams])

  const clearAll = () => router.push('/talleres')

  const hasFilters = Object.values(current).some(v => v !== '')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Filtros</h2>
        {hasFilters && (
          <button onClick={clearAll} className="text-xs text-purple-600 hover:underline">
            Limpiar
          </button>
        )}
      </div>

      {/* Tipo de arte */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Tipo de arte</label>
        <div className="flex flex-wrap gap-2">
          {tipos.map((t) => (
            <button
              key={t.value}
              onClick={() => updateFilter('tipo', t.value)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                current.tipo === t.value
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Modalidad */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Modalidad</label>
        <select
          value={current.modalidad}
          onChange={(e) => updateFilter('modalidad', e.target.value)}
          className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg"
        >
          {modalidades.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Día */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Día</label>
        <select
          value={current.dia}
          onChange={(e) => updateFilter('dia', e.target.value)}
          className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg"
        >
          {dias.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>

      {/* Comuna */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Comuna</label>
        <input
          type="text"
          value={current.comuna}
          onChange={(e) => updateFilter('comuna', e.target.value)}
          placeholder="Ej: Providencia"
          className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      {/* Precio máximo */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Precio máximo</label>
        <input
          type="number"
          value={current.precioMax}
          onChange={(e) => updateFilter('precioMax', e.target.value)}
          placeholder="$"
          className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>
    </div>
  )
}
