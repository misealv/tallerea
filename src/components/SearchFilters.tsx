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
    tipo:         searchParams.get('tipo') || '',
    modalidad:    searchParams.get('modalidad') || '',
    dia:          searchParams.get('dia') || '',
    comuna:       searchParams.get('comuna') || '',
    precioMax:    searchParams.get('precioMax') || '',
    horario:      searchParams.get('horario') || '',
    edadRango:    searchParams.get('edadRango') || '',
    modeloAcceso: searchParams.get('modeloAcceso') || '',
    clasePrueba:  searchParams.get('clasePrueba') || '',
    conCupo:      searchParams.get('conCupo') || '',
  }

  const updateFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('page')
    router.push(`/talleres?${params.toString()}`)
  }, [router, searchParams])

  const toggleFilter = useCallback((key: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (params.get(key)) {
      params.delete(key)
    } else {
      params.set(key, '1')
    }
    params.delete('page')
    router.push(`/talleres?${params.toString()}`)
  }, [router, searchParams])

  const clearAll = () => router.push('/talleres')

  const hasFilters = Object.values(current).some(v => v !== '')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Filtros</h2>
        {hasFilters && (
          <button onClick={clearAll} className="text-xs text-purple-600 hover:underline">
            Limpiar todo
          </button>
        )}
      </div>

      {/* Tipo de arte */}
      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Tipo de arte</label>
        <div className="flex flex-wrap gap-1.5">
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
        <label className="text-xs text-gray-500 mb-1.5 block">Modalidad</label>
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
        <label className="text-xs text-gray-500 mb-1.5 block">Día de la semana</label>
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

      {/* Horario */}
      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Horario</label>
        <div className="flex gap-2">
          {[
            { value: 'manana', label: '☀️ Mañana', sub: '8–13h' },
            { value: 'tarde',  label: '🌤 Tarde',   sub: '13–19h' },
            { value: 'noche',  label: '🌙 Noche',   sub: '19h+' },
          ].map((h) => (
            <button
              key={h.value}
              onClick={() => updateFilter('horario', current.horario === h.value ? '' : h.value)}
              className={`flex-1 text-xs px-2 py-2 rounded-lg border transition-colors leading-tight ${
                current.horario === h.value
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
              }`}
            >
              <div>{h.label}</div>
              <div className="opacity-70">{h.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Edad */}
      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Edad</label>
        <div className="flex gap-2">
          {[
            { value: 'infantil', label: '🧒 Niños',    sub: 'hasta 12' },
            { value: 'jovenes',  label: '🧑 Jóvenes',  sub: '12–18' },
            { value: 'adultos',  label: '👤 Adultos',  sub: '18+' },
          ].map((e) => (
            <button
              key={e.value}
              onClick={() => updateFilter('edadRango', current.edadRango === e.value ? '' : e.value)}
              className={`flex-1 text-xs px-2 py-2 rounded-lg border transition-colors leading-tight ${
                current.edadRango === e.value
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
              }`}
            >
              <div>{e.label}</div>
              <div className="opacity-70">{e.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Modelo de acceso */}
      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Tipo de inscripción</label>
        <div className="flex gap-2">
          {[
            { value: 'puntual',     label: '📅 Clases sueltas' },
            { value: 'recurrente',  label: '🔄 Suscripción' },
          ].map((m) => (
            <button
              key={m.value}
              onClick={() => updateFilter('modeloAcceso', current.modeloAcceso === m.value ? '' : m.value)}
              className={`flex-1 text-xs px-2 py-2 rounded-lg border transition-colors ${
                current.modeloAcceso === m.value
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Comuna */}
      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Comuna</label>
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
        <label className="text-xs text-gray-500 mb-1.5 block">Precio máximo</label>
        <input
          type="number"
          value={current.precioMax}
          onChange={(e) => updateFilter('precioMax', e.target.value)}
          placeholder="$"
          className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      {/* Checkboxes */}
      <div className="space-y-2 pt-1">
        <label className="flex items-center gap-2 cursor-pointer" onClick={() => toggleFilter('clasePrueba')}>
          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${current.clasePrueba ? 'bg-purple-600 border-purple-600' : 'border-gray-400'}`}>
            {current.clasePrueba && <span className="text-white text-[10px] font-bold">✓</span>}
          </div>
          <span className="text-sm text-gray-700">🎁 Con clase de prueba</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer" onClick={() => toggleFilter('conCupo')}>
          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${current.conCupo ? 'bg-purple-600 border-purple-600' : 'border-gray-400'}`}>
            {current.conCupo && <span className="text-white text-[10px] font-bold">✓</span>}
          </div>
          <span className="text-sm text-gray-700">✅ Con cupos disponibles</span>
        </label>
      </div>
    </div>
  )
}
