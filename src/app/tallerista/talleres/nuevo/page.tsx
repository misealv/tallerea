'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

// ── Tipos locales ────────────────────────────────────────────────────────────

type ModeloAcceso = 'puntual' | 'recurrente'

interface Paso1Data {
  modeloAcceso: ModeloAcceso
  titulo: string
  tipo: string
  modalidad: 'presencial' | 'online' | 'hibrido'
  precio: string           // string para el input, se convierte a entero
  precioModalidad: 'bruto' | 'neto'
  horasAntesCancelacion: string
  permitirReagendamiento: boolean
}

interface Paso2Data {
  descripcion: string
  duracionSesion: string
  cupoPorSesion: string
  fechaInicio: string
  // Plan (solo recurrente)
  sesionesIncluidas: string
  vigencia: 'mensual' | 'por_ciclo' | 'sin_vencimiento'
}

// ── Constantes ───────────────────────────────────────────────────────────────

const TIPOS = [
  { value: 'visual',       label: 'Artes visuales' },
  { value: 'teatro',       label: 'Teatro' },
  { value: 'danza',        label: 'Danza' },
  { value: 'musica',       label: 'Música' },
  { value: 'ceramica',     label: 'Cerámica' },
  { value: 'yoga',         label: 'Yoga / Bienestar' },
  { value: 'cocina',       label: 'Cocina' },
  { value: 'fotografia',   label: 'Fotografía' },
  { value: 'escritura',    label: 'Escritura' },
  { value: 'manualidades', label: 'Manualidades' },
  { value: 'bienestar',    label: 'Bienestar' },
  { value: 'tecnologia',   label: 'Tecnología' },
  { value: 'idiomas',      label: 'Idiomas' },
  { value: 'infantil',     label: 'Infantil' },
  { value: 'otro',         label: 'Otro' },
]

// ── Componente ────────────────────────────────────────────────────────────────

export default function NuevoTallerPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [paso, setPaso] = useState<1 | 2>(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [p1, setP1] = useState<Paso1Data>({
    modeloAcceso:            'puntual',
    titulo:                  '',
    tipo:                    '',
    modalidad:               'presencial',
    precio:                  '',
    precioModalidad:         'bruto',
    horasAntesCancelacion:   '24',
    permitirReagendamiento:  true,
  })

  const [p2, setP2] = useState<Paso2Data>({
    descripcion:      '',
    duracionSesion:   '90',
    cupoPorSesion:    '10',
    fechaInicio:      '',
    sesionesIncluidas:'8',
    vigencia:         'mensual',
  })

  function up1<K extends keyof Paso1Data>(k: K, v: Paso1Data[K]) {
    setP1(prev => ({ ...prev, [k]: v }))
  }
  function up2<K extends keyof Paso2Data>(k: K, v: Paso2Data[K]) {
    setP2(prev => ({ ...prev, [k]: v }))
  }

  function validarPaso1(): string | null {
    if (!p1.titulo.trim()) return 'Escribe el nombre del taller'
    if (!p1.tipo) return 'Selecciona un tipo de taller'
    const precio = parseInt(p1.precio)
    if (isNaN(precio) || precio < 0) return 'El precio debe ser un número entero positivo (0 para gratuito)'
    return null
  }

  function validarPaso2(): string | null {
    if (!p2.descripcion.trim()) return 'Escribe la descripción del taller'
    if (!p2.fechaInicio) return 'Selecciona la fecha de inicio'
    const cupo = parseInt(p2.cupoPorSesion)
    if (isNaN(cupo) || cupo < 1) return 'El cupo debe ser al menos 1'
    if (p1.modeloAcceso === 'recurrente') {
      const ses = parseInt(p2.sesionesIncluidas)
      if (isNaN(ses) || ses < 1) return 'Las sesiones incluidas deben ser al menos 1'
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errV = validarPaso2()
    if (errV) { setError(errV); return }
    setError('')
    setLoading(true)

    const precio = parseInt(p1.precio) || 0

    const body: Record<string, unknown> = {
      titulo:      p1.titulo.trim(),
      tipo:        p1.tipo,
      modalidad:   p1.modalidad,
      precio,
      precioModalidad: p1.precioModalidad,
      modeloAcceso: p1.modeloAcceso,
      politica: {
        horasAntesCancelacion: parseInt(p1.horasAntesCancelacion) || 24,
        permitirReagendamiento: p1.permitirReagendamiento,
      },
      descripcion:    p2.descripcion.trim(),
      duracionSesion: parseInt(p2.duracionSesion) || 90,
      cupoPorSesion:  parseInt(p2.cupoPorSesion) || 10,
      fechaInicio:    p2.fechaInicio,
    }

    if (p1.modeloAcceso === 'recurrente') {
      body.plan = {
        sesionesIncluidas: parseInt(p2.sesionesIncluidas) || 8,
        vigencia:          p2.vigencia,
        horasAntesCancelacion: parseInt(p1.horasAntesCancelacion) || 24,
        permitirCambioPostPlazo: p1.permitirReagendamiento,
        politicaNoShow: 'pierde',
        precioSesionSuelta: null,
      }
    }

    // Incluir ownerId desde sesión
    if (session?.user?.id) body.ownerId = session.user.id

    const res = await fetch('/api/workshops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error || 'Error al crear el taller'); return }
    router.push(`/tallerista/talleres/${data._id}/editar`)
    router.refresh()
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Indicador de paso */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2].map(n => (
          <div key={n} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${paso === n ? 'bg-purple-600 text-white' : paso > n ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {paso > n ? '✓' : n}
            </div>
            <span className={`text-sm ${paso === n ? 'text-purple-700 font-medium' : 'text-gray-400'}`}>
              {n === 1 ? 'Modelo y precio' : 'Detalles'}
            </span>
            {n < 2 && <div className="w-8 h-px bg-gray-300" />}
          </div>
        ))}
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-6">{error}</div>}

      {/* ── PASO 1 ── */}
      {paso === 1 && (
        <form onSubmit={e => { e.preventDefault(); const err = validarPaso1(); if (err) { setError(err); return; } setError(''); setPaso(2) }} className="space-y-6 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900">Modelo y precio</h2>

          {/* Modelo de acceso */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de acceso</label>
            <div className="grid grid-cols-2 gap-3">
              {(['puntual', 'recurrente'] as const).map(m => (
                <button key={m} type="button" onClick={() => up1('modeloAcceso', m)}
                  className={`border-2 rounded-xl p-4 text-left transition-colors ${p1.modeloAcceso === m ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-300'}`}>
                  <p className="font-semibold text-gray-800 capitalize">{m}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {m === 'puntual' ? 'Una clase, pago único' : 'Suscripción mensual con reservas'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del taller</label>
            <input required value={p1.titulo} onChange={e => up1('titulo', e.target.value)} maxLength={150}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Ej: Cerámica para principiantes" />
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <select required value={p1.tipo} onChange={e => up1('tipo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500">
              <option value="">Seleccionar…</option>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Modalidad */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Modalidad</label>
            <div className="flex gap-2">
              {(['presencial', 'online', 'hibrido'] as const).map(m => (
                <button key={m} type="button" onClick={() => up1('modalidad', m)}
                  className={`flex-1 py-2 rounded-lg border text-sm transition-colors ${p1.modalidad === m ? 'border-purple-500 bg-purple-50 text-purple-700 font-medium' : 'border-gray-200 text-gray-600 hover:border-purple-300'}`}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Precio */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio (CLP)</label>
              <input type="number" min="0" step="1" value={p1.precio} onChange={e => up1('precio', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                placeholder="25000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modalidad precio</label>
              <select value={p1.precioModalidad} onChange={e => up1('precioModalidad', e.target.value as 'bruto' | 'neto')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500">
                <option value="bruto">Bruto (lo paga el alumno)</option>
                <option value="neto">Neto (lo recibo yo)</option>
              </select>
            </div>
          </div>

          {/* Política */}
          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Política de cancelación</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Horas mínimas previas</label>
                <input type="number" min="0" value={p1.horasAntesCancelacion}
                  onChange={e => up1('horasAntesCancelacion', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="reagendar" checked={p1.permitirReagendamiento}
                  onChange={e => up1('permitirReagendamiento', e.target.checked)}
                  className="w-4 h-4 accent-purple-600" />
                <label htmlFor="reagendar" className="text-sm text-gray-700">Permitir reagendamiento</label>
              </div>
            </div>
          </div>

          <button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 rounded-lg transition-colors">
            Continuar →
          </button>
        </form>
      )}

      {/* ── PASO 2 ── */}
      {paso === 2 && (
        <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900">Detalles del taller</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción <span className="text-gray-400 text-xs">({p2.descripcion.length}/2000)</span>
            </label>
            <textarea required rows={4} value={p2.descripcion} onChange={e => up2('descripcion', e.target.value)} maxLength={2000}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="¿De qué trata el taller? ¿Qué aprenderán los alumnos?" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duración por sesión (min)</label>
              <input type="number" min="30" max="480" step="15" value={p2.duracionSesion}
                onChange={e => up2('duracionSesion', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cupo por sesión</label>
              <input type="number" min="1" max="100" value={p2.cupoPorSesion}
                onChange={e => up2('cupoPorSesion', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de inicio</label>
            <input required type="date" value={p2.fechaInicio} onChange={e => up2('fechaInicio', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" />
          </div>

          {/* Plan — solo recurrente */}
          {p1.modeloAcceso === 'recurrente' && (
            <div className="border-t pt-4 space-y-4">
              <p className="text-sm font-medium text-gray-700">Plan de suscripción</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Sesiones incluidas por período</label>
                  <input type="number" min="1" value={p2.sesionesIncluidas}
                    onChange={e => up2('sesionesIncluidas', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Vigencia</label>
                  <select value={p2.vigencia} onChange={e => up2('vigencia', e.target.value as Paso2Data['vigencia'])}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500">
                    <option value="mensual">Mensual</option>
                    <option value="por_ciclo">Por ciclo</option>
                    <option value="sin_vencimiento">Sin vencimiento</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={() => { setError(''); setPaso(1) }}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-lg transition-colors">
              ← Volver
            </button>
            <button type="submit" disabled={loading}
              className="flex-2 flex-grow bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 rounded-lg disabled:opacity-50 transition-colors">
              {loading ? 'Creando taller…' : 'Crear taller'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
