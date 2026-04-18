'use client'

import { useState } from 'react'
import Image from 'next/image'

interface StockImage {
  id: number
  thumb: string
  full: string
  photographer: string
  alt: string
}

interface StockImagePickerProps {
  tipo: string
  titulo: string
  currentCount: number
  max: number
  onImport: (url: string) => void
}

export default function StockImagePicker({ tipo, titulo, currentCount, max, onImport }: StockImagePickerProps) {
  const [open, setOpen] = useState(false)
  const [images, setImages] = useState<StockImage[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  async function search(q?: string, p = 1) {
    setLoading(true)
    setError('')
    try {
      const searchQuery = q !== undefined ? q : query
      const params = new URLSearchParams({ tipo, page: String(p) })
      if (searchQuery.trim()) params.set('q', searchQuery)

      const res = await fetch(`/api/images/suggest?${params}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al buscar')
        setLoading(false)
        return
      }

      if (p === 1) {
        setImages(data.images)
      } else {
        setImages(prev => [...prev, ...data.images])
      }
      setPage(p)
    } catch {
      setError('Error de conexión')
    }
    setLoading(false)
  }

  async function importImage(img: StockImage) {
    if (currentCount >= max) {
      setError(`Máximo ${max} fotos`)
      return
    }
    setImporting(img.id)
    setError('')
    try {
      const res = await fetch('/api/images/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: img.full, folder: 'tallerea/workshops' }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Error al importar (${res.status})`)
        setImporting(null)
        return
      }

      if (!data.url) {
        setError('No se recibió URL de la imagen importada')
        setImporting(null)
        return
      }

      onImport(data.url)
      setImages(prev => prev.filter(i => i.id !== img.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión al importar')
    }
    setImporting(null)
  }

  function handleOpen() {
    setOpen(true)
    if (images.length === 0) search(titulo || undefined)
  }

  if (!open) {
    return (
      <button type="button" onClick={handleOpen}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition">
        📷 Buscar fotos profesionales
      </button>
    )
  }

  return (
    <div className="border border-indigo-200 rounded-xl p-4 space-y-4 bg-indigo-50/30">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 text-sm">Fotos profesionales gratuitas</h3>
        <button type="button" onClick={() => setOpen(false)}
          className="text-gray-400 hover:text-gray-600 text-sm">✕ Cerrar</button>
      </div>

      {/* Barra de búsqueda */}
      <div className="flex gap-2">
        <input type="text" placeholder="Buscar (ej: acuarela, cerámica, danza...)"
          value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), search(query, 1))}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-transparent" />
        <button type="button" onClick={() => search(query, 1)} disabled={loading}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
          Buscar
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Grilla de resultados */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map(img => (
            <button key={img.id} type="button" onClick={() => importImage(img)}
              disabled={importing !== null || currentCount >= max}
              className="group relative aspect-[3/2] rounded-lg overflow-hidden bg-gray-100 hover:ring-2 hover:ring-indigo-400 transition disabled:opacity-50">
              <Image src={img.thumb} alt={img.alt || 'Foto sugerida'} fill
                className="object-cover" sizes="(max-width: 640px) 50vw, 33vw" unoptimized />
              {/* Overlay con info */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center">
                {importing === img.id ? (
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition">
                    + Usar foto
                  </span>
                )}
              </div>
              {/* Crédito fotógrafo */}
              <span className="absolute bottom-1 left-1 text-[10px] text-white/80 bg-black/30 px-1 rounded">
                📷 {img.photographer}
              </span>
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8 text-sm text-indigo-600">
          <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mr-2" />
          Buscando fotos...
        </div>
      )}

      {/* Cargar más */}
      {images.length > 0 && !loading && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Fotos por <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-indigo-600">Pexels</a></span>
          <button type="button" onClick={() => search(query, page + 1)}
            className="text-indigo-600 hover:underline font-medium">
            Cargar más →
          </button>
        </div>
      )}
    </div>
  )
}
