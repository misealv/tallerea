'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useSession } from 'next-auth/react'

interface ClasePruebaCTAProps {
  workshopId: string
  workshopSlug: string
  precio: number          // 0 = gratuita
  variant: 'hero' | 'footer'
}

export default function ClasePruebaCTA({ workshopId, workshopSlug, precio, variant }: ClasePruebaCTAProps) {
  const router = useRouter()
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (!session?.user) {
      router.push(`/talleres/${workshopSlug}/inscribirse?clasePrueba=true`)
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshopId, esClasePrueba: true }),
      })
      const data = await res.json()
      if (!res.ok) return
      if (data.free || !data.initPoint) { router.push('/alumno?pago=ok'); return }
      window.location.href = data.initPoint
    } finally {
      setLoading(false)
    }
  }

  const label = precio === 0
    ? '¡Reserva tu clase de prueba gratis!'
    : `Reserva tu clase de prueba — $${precio.toLocaleString('es-CL')}`

  const sublabel = precio === 0
    ? 'Sin costo · Sin compromiso · Cupos limitados'
    : 'Precio especial para tu primera clase · Sin compromiso'

  if (variant === 'hero') {
    return (
      <div className="bg-gradient-to-r from-purple-600 to-purple-500 rounded-xl p-5 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <p className="text-white font-bold text-lg leading-tight">
            {precio === 0 ? '🎁 Clase de prueba gratuita disponible' : '🎟️ Clase de prueba disponible'}
          </p>
          <p className="text-purple-100 text-sm mt-0.5">{sublabel}</p>
        </div>
        <button
          onClick={handleClick}
          disabled={loading}
          className="flex-shrink-0 bg-white text-purple-700 font-semibold px-6 py-2.5 rounded-lg hover:bg-purple-50 disabled:opacity-60 transition-colors text-sm whitespace-nowrap"
        >
          {loading ? 'Cargando…' : precio === 0 ? 'Reservar gratis →' : 'Reservar →'}
        </button>
      </div>
    )
  }

  // variant === 'footer'
  return (
    <div className="mt-10 border-t border-gray-100 pt-10">
      <div className="bg-purple-50 border border-purple-200 rounded-2xl p-8 text-center">
        <p className="text-2xl font-bold text-gray-900 mb-2">
          {precio === 0 ? '¿Quieres probar antes de inscribirte?' : '¿Todavía tienes dudas?'}
        </p>
        <p className="text-gray-500 mb-6 max-w-md mx-auto">
          {precio === 0
            ? 'Toma una clase de prueba sin costo y sin compromiso. Conoce al profesor y siente la dinámica del taller.'
            : `Toma una clase de prueba por solo $${precio.toLocaleString('es-CL')} y decide luego si continúas. Sin compromiso.`}
        </p>
        <button
          onClick={handleClick}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-8 py-3 rounded-xl text-base disabled:opacity-60 transition-colors"
        >
          {loading ? 'Cargando…' : label}
        </button>
        {precio === 0 && (
          <p className="text-xs text-gray-400 mt-3">Cupos limitados por sesión</p>
        )}
      </div>
    </div>
  )
}
