'use client'

import { useState } from 'react'

interface AIDescriptionHelperProps {
  titulo: string
  tipo: string
  modalidad: string
  descripcion: string
  tipoCuenta?: 'individual' | 'institucion'
  onApply: (text: string) => void
}

export default function AIDescriptionHelper({ titulo, tipo, modalidad, descripcion, tipoCuenta, onApply }: AIDescriptionHelperProps) {
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  const [genCount, setGenCount] = useState(0)
  const [improveCount, setImproveCount] = useState(0)

  const MAX_GEN = 2
  const MAX_IMPROVE = 1

  async function generate(accion: 'generar' | 'mejorar' | 'resumir') {
    if (!titulo.trim()) {
      setError('Escribe un título primero')
      return
    }

    if (accion === 'generar' && genCount >= MAX_GEN) {
      setError(`Máximo ${MAX_GEN} generaciones por sesión`)
      return
    }
    if ((accion === 'mejorar' || accion === 'resumir') && improveCount >= MAX_IMPROVE) {
      setError(`Máximo ${MAX_IMPROVE} mejora por sesión`)
      return
    }

    setLoading(true)
    setError('')
    setPreview('')

    try {
      const res = await fetch('/api/ai/describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo, tipo, modalidad, descripcionActual: descripcion, accion, tipoCuenta }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al generar')
        setLoading(false)
        return
      }

      if (accion === 'generar') setGenCount(prev => prev + 1)
      else setImproveCount(prev => prev + 1)

      setPreview(data.text)
    } catch {
      setError('Error de conexión')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-3">
      {/* Botones de acción */}
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={() => generate('generar')} disabled={loading || genCount >= MAX_GEN}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition">
          ✨ Generar descripción {genCount > 0 && <span className="text-purple-400">({genCount}/{MAX_GEN})</span>}
        </button>
        {descripcion.trim().length > 20 && (
          <>
            <button type="button" onClick={() => generate('mejorar')} disabled={loading || improveCount >= MAX_IMPROVE}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition">
              🔄 Mejorar texto {improveCount > 0 && <span className="text-blue-400">({improveCount}/{MAX_IMPROVE})</span>}
            </button>
            <button type="button" onClick={() => generate('resumir')} disabled={loading || improveCount >= MAX_IMPROVE}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 transition">
              📝 Resumir
            </button>
          </>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-purple-600">
          <div className="w-4 h-4 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
          Generando con IA...
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Preview del texto generado */}
      {preview && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
          <p className="text-xs font-medium text-purple-600">Sugerencia de IA</p>
          <p className="text-sm text-gray-800 whitespace-pre-line">{preview}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => { onApply(preview); setPreview('') }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition">
              Usar este texto
            </button>
            <button type="button" onClick={() => { onApply(descripcion ? `${descripcion}\n\n${preview}` : preview); setPreview('') }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-purple-300 text-purple-700 hover:bg-purple-50 transition">
              Agregar al final
            </button>
            <button type="button" onClick={() => setPreview('')}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-gray-500 hover:text-gray-700 transition">
              Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
