'use client'

export const dynamic = 'force-dynamic'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import SlotCalendarPicker from '@/components/SlotCalendarPicker'

interface Slot {
  dia: string
  horaInicio: string
  horaFin: string
  cupoMax: number
  cupoDisponible: number
}

interface Workshop {
  _id: string
  titulo: string
  precio: number
  precioModalidad?: 'bruto' | 'neto'
  precioPublico: number
  cupoDisponible: number
  cupoMax: number
  fechaInicio: string
  slots: Slot[]
  clasePrueba?: {
    habilitada: boolean
    precio: number
  }
}

export default function InscribirsePage({ params }: { params: { slug: string } }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [workshop, setWorkshop] = useState<Workshop | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const slug = params.slug
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(null)
  const [selectedFecha, setSelectedFecha] = useState<string | null>(null)
  // Datos del invitado (solo cuando no hay sesión)
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')

  // Params desde PrecioCard
  const montoVoluntarioParam = typeof window !== 'undefined'
    ? Number(new URL(window.location.href).searchParams.get('montoVoluntario') ?? '') || undefined
    : undefined
  const esClasePrueba = typeof window !== 'undefined'
    ? new URL(window.location.href).searchParams.get('clasePrueba') === 'true'
    : false

  useEffect(() => {
    if (!slug) return
    fetch(`/api/workshops?slug=${slug}`)
      .then(r => r.json())
      .then(data => {
        // Buscar por slug en los resultados
        const found = data.data?.find((w: Workshop & { slug: string }) => w.slug === slug)
        setWorkshop(found || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [slug])

  // Sin redirect forzado a /login — el alumno puede comprar como invitado y recibir magic link tras pago

  const isGuest = status === 'unauthenticated'

  const handleInscribirse = async () => {
    if (!workshop) return
    const hasSlots = workshop.slots && workshop.slots.length > 0

    // Si tiene slots, validar selección
    if (hasSlots && (selectedSlotIdx === null || !selectedFecha)) {
      setError('Selecciona una fecha y horario')
      return
    }

    // Validar datos de invitado
    if (isGuest) {
      if (!guestName.trim() || !guestEmail.trim()) {
        setError('Ingresa tu nombre y email para continuar')
        return
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
        setError('Email inválido')
        return
      }
    }

    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workshopId: workshop._id,
          slotIndex: hasSlots ? selectedSlotIdx : null,
          ...(selectedFecha ? { fecha: selectedFecha } : {}),
          ...(esClasePrueba ? { esClasePrueba: true } : {}),
          ...(montoVoluntarioParam !== undefined ? { montoVoluntario: montoVoluntarioParam } : {}),
          ...(isGuest ? { name: guestName.trim(), email: guestEmail.trim() } : {}),
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al inscribirse')
        setSubmitting(false)
        return
      }

      if (data.free) {
        router.push(session ? '/alumno?pago=ok' : '/?pago=ok&revisa=email')
        return
      }
      if (data.initPoint) {
        window.location.href = data.initPoint
        return
      }

      router.push(session ? '/alumno?pago=ok' : '/?pago=ok&revisa=email')
    } catch {
      setError('Error de conexión')
      setSubmitting(false)
    }
  }

  if (status === 'loading' || loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Cargando...</div>
  }

  if (!workshop) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Taller no encontrado</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Confirmar inscripción</h1>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">{workshop.titulo}</h2>

          {/* Selector de slot si tiene slots */}
          {workshop.slots && workshop.slots.length > 0 ? (
            <SlotCalendarPicker
              slots={workshop.slots}
              fechaInicio={workshop.fechaInicio}
              selectedSlotIndex={selectedSlotIdx}
              selectedFecha={selectedFecha}
              onSelect={(slotIndex, fecha) => { setSelectedSlotIdx(slotIndex); setSelectedFecha(fecha) }}
            />
          ) : (
            <p className="text-xs text-gray-400">{workshop.cupoDisponible} cupos disponibles</p>
          )}

          <p className="text-sm text-gray-500">
            Inicio: {new Date(workshop.fechaInicio).toLocaleDateString('es-CL')}
          </p>

          <div className="border-t border-gray-100 pt-3">
            <div className="flex justify-between text-lg">
              <span className="font-medium">
                {esClasePrueba ? 'Clase de prueba' : 'Total'}
              </span>
              <span className="font-bold text-purple-700">
                {(() => {
                  const precio = esClasePrueba
                    ? (workshop.clasePrueba?.precio ?? 0)
                    : workshop.precioPublico
                  return precio === 0 ? 'Gratis' : `$${precio.toLocaleString('es-CL')}`
                })()}
              </span>
            </div>
            {esClasePrueba && (
              <p className="text-xs text-gray-400 mt-1">1 sesión de prueba · sin compromiso</p>
            )}
          </div>
        </div>

        {isGuest && (
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">Tus datos</p>
              <p className="text-xs text-gray-500 mt-1">
                Te enviaremos un enlace mágico al correo para activar tu cuenta tras el pago.
              </p>
            </div>
            <input
              type="text"
              placeholder="Nombre completo"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              autoComplete="name"
            />
            <input
              type="email"
              placeholder="tu@email.cl"
              value={guestEmail}
              onChange={e => setGuestEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              autoComplete="email"
            />
            <p className="text-xs text-gray-400">
              ¿Ya tienes cuenta?{' '}
              <a href={`/login?callbackUrl=/talleres/${slug}/inscribirse`} className="text-purple-600 hover:underline">
                Inicia sesión
              </a>
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

        <button
          onClick={handleInscribirse}
          disabled={submitting || (workshop.slots?.length > 0 ? selectedSlotIdx === null : workshop.cupoDisponible <= 0)}
          className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {submitting
            ? 'Procesando...'
            : (() => {
                const precio = esClasePrueba
                  ? (workshop.clasePrueba?.precio ?? 0)
                  : workshop.precioPublico
                if (precio === 0) return esClasePrueba ? 'Reservar clase de prueba gratis' : 'Inscribirme gratis'
                return `Pagar $${precio.toLocaleString('es-CL')}`
              })()}
        </button>

        <button
          onClick={() => router.back()}
          className="w-full text-sm text-gray-500 hover:text-gray-700"
        >
          Volver al taller
        </button>
      </div>
    </div>
  )
}
