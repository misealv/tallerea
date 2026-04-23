'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ReviewFormProps {
  workshopId: string
  workshopTitulo: string
}

export default function ReviewForm({ workshopId, workshopTitulo }: ReviewFormProps) {
  const router = useRouter()
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [enviado, setEnviado] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rating === 0) { setError('Selecciona una puntuación'); return }
    if (comentario.trim().length < 10) { setError('El comentario debe tener al menos 10 caracteres'); return }

    setEnviando(true)
    setError('')
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshopId, rating, comentario: comentario.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Error al enviar')
      }
      setEnviado(true)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al enviar el review')
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
        ¡Gracias por tu reseña de <strong>{workshopTitulo}</strong>!
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Estrellas */}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            className="text-2xl focus:outline-none"
            aria-label={`${star} estrella${star > 1 ? 's' : ''}`}
          >
            <span className={(hover || rating) >= star ? 'text-yellow-400' : 'text-gray-300'}>
              ★
            </span>
          </button>
        ))}
      </div>

      {/* Comentario */}
      <textarea
        value={comentario}
        onChange={e => setComentario(e.target.value)}
        placeholder="Cuéntanos tu experiencia (mínimo 10 caracteres)"
        rows={3}
        maxLength={1000}
        className="w-full rounded-lg border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
      />
      <div className="text-right text-xs text-gray-400">{comentario.length}/1000</div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={enviando}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {enviando ? 'Enviando…' : 'Publicar reseña'}
      </button>
    </form>
  )
}
