'use client'

import { useRouter } from 'next/navigation'

interface ClasePruebaCTAProps {
  workshopSlug: string
  precio: number          // 0 = gratuita
  variant: 'hero' | 'footer'
}

export default function ClasePruebaCTA({ workshopSlug, precio, variant }: ClasePruebaCTAProps) {
  const router = useRouter()

  function handleClick() {
    // Siempre pasar por el checkout: permite elegir horario y confirmar datos
    router.push(`/talleres/${workshopSlug}/inscribirse?clasePrueba=true`)
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
          className="flex-shrink-0 bg-white text-purple-700 font-semibold px-6 py-2.5 rounded-lg hover:bg-purple-50 transition-colors text-sm whitespace-nowrap"
        >
          {precio === 0 ? 'Reservar gratis →' : 'Reservar →'}
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
          className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-8 py-3 rounded-xl text-base transition-colors"
        >
          {label}
        </button>
        {precio === 0 && (
          <p className="text-xs text-gray-400 mt-3">Cupos limitados por sesión</p>
        )}
      </div>
    </div>
  )
}
