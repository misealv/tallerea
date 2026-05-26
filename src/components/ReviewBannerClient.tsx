'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const STORAGE_KEY = 'tallerea_review_banner_dismissed_at'
const DISMISS_DAYS = 7

export default function ReviewBannerClient({ count }: { count: number }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (count === 0) return
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const diasTranscurridos = (Date.now() - Number(raw)) / (1000 * 60 * 60 * 24)
      if (diasTranscurridos < DISMISS_DAYS) return
    }
    setVisible(true)
  }, [count])

  if (!visible) return null

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, String(Date.now()))
    setVisible(false)
  }

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className="text-xl mt-0.5">⭐</span>
          <div>
            <p className="text-sm font-semibold text-indigo-900">
              {count === 1
                ? 'Tienes 1 taller pendiente de reseñar'
                : `Tienes ${count} talleres pendientes de reseñar`}
            </p>
            <p className="text-xs text-indigo-600 mt-0.5">
              Tu opinión ayuda a otros alumnos a elegir su próximo taller.
            </p>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="text-indigo-400 hover:text-indigo-600 text-xl leading-none shrink-0"
          aria-label="Cerrar banner"
        >
          ×
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <Link
          href="/alumno/reviews"
          className="text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded-lg transition-colors"
        >
          Dejar mi reseña
        </Link>
        <button
          onClick={dismiss}
          className="text-sm text-indigo-500 hover:text-indigo-700 px-3 py-1.5 transition-colors"
        >
          Más tarde
        </button>
      </div>
    </div>
  )
}
