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
  cupoMax?: number
  cupoDisponible?: number
  reservas?: number
  fecha?: string | Date
}

interface Paquete {
  _id: string
  nombre: string
  precio: number
  sesionesIncluidas: number
  duracionDias: number
  activo: boolean
}

interface Workshop {
  _id: string
  titulo: string
  precio: number
  precioModalidad?: 'bruto' | 'neto'
  precioPublico: number
  cupoDisponible: number
  cupoMax: number
  cupoPorSesion?: number
  fechaInicio: string
  slots: Slot[]
  modeloAcceso?: 'puntual' | 'recurrente'
  modalidadPrecio?: 'gratuito' | 'fijo' | 'voluntario' | 'paquetes'
  paquetes?: Paquete[]
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
  // ¿Para quién?
  const [paraQuien, setParaQuien] = useState<'yo' | 'otro'>('yo')
  const [dependentNombre, setDependentNombre] = useState('')
  const [dependentFechaNacimiento, setDependentFechaNacimiento] = useState('')

  // Params desde PrecioCard
  const montoVoluntarioParam = typeof window !== 'undefined'
    ? Number(new URL(window.location.href).searchParams.get('montoVoluntario') ?? '') || undefined
    : undefined
  const esClasePrueba = typeof window !== 'undefined'
    ? new URL(window.location.href).searchParams.get('clasePrueba') === 'true'
    : false
  // Paquete (plan) elegido en PrecioCard para talleres recurrentes
  const paqueteIdParam = typeof window !== 'undefined'
    ? (new URL(window.location.href).searchParams.get('paquete') || undefined)
    : undefined

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
    const esPuntualLocal = workshop.modeloAcceso === 'puntual'
    const hasSlots = workshop.slots && workshop.slots.length > 0

    // Para puntual: auto-seleccionar el slot 0 (no hay picker)
    let resolvedSlotIdx = selectedSlotIdx
    let resolvedFecha = selectedFecha
    if (esPuntualLocal && hasSlots) {
      resolvedSlotIdx = 0
      const slotFecha = workshop.slots[0]?.fecha
      resolvedFecha = slotFecha ? new Date(slotFecha).toISOString() : null
    }

    // Para recurrente: validar que haya selección
    if (!esPuntualLocal && hasSlots && (resolvedSlotIdx === null || !resolvedFecha)) {
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

    // Validar dependiente
    if (paraQuien === 'otro' && !dependentNombre.trim()) {
      setError('Ingresa el nombre de quien tomará el taller')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workshopId: workshop._id,
          slotIndex: hasSlots ? resolvedSlotIdx : null,
          ...(resolvedFecha ? { fecha: resolvedFecha } : {}),
          ...(esClasePrueba ? { esClasePrueba: true } : {}),
          ...(paqueteIdParam ? { paqueteId: paqueteIdParam } : {}),
          ...(montoVoluntarioParam !== undefined ? { montoVoluntario: montoVoluntarioParam } : {}),
          ...(isGuest ? { name: guestName.trim(), email: guestEmail.trim() } : {}),
          ...(paraQuien === 'otro' && dependentNombre.trim()
            ? {
                dependentNombre: dependentNombre.trim(),
                ...(dependentFechaNacimiento ? { dependentFechaNacimiento } : {}),
              }
            : {}),
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

  const esPuntual = workshop.modeloAcceso === 'puntual'
  const slotPuntual = esPuntual && workshop.slots?.length > 0 ? workshop.slots[0] : null
  const fechaLabel = (() => {
    const src = slotPuntual?.fecha ?? workshop.fechaInicio
    if (!src) return null
    return new Date(src).toLocaleDateString('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    })
  })()
  const horaLabel = slotPuntual?.horaInicio
    ? slotPuntual.horaFin
      ? `${slotPuntual.horaInicio} – ${slotPuntual.horaFin} hrs`
      : `${slotPuntual.horaInicio} hrs`
    : null

  const paqueteSel = paqueteIdParam
    ? (workshop.paquetes ?? []).find(p => p._id === paqueteIdParam && p.activo)
    : undefined
  const precio = esClasePrueba
    ? (workshop.clasePrueba?.precio ?? 0)
    : (paqueteSel ? paqueteSel.precio : workshop.precioPublico)
  const precioLabel = precio === 0
    ? 'Gratis'
    : `$${precio.toLocaleString('es-CL')}`

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center px-4 py-10">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-5">
          <p className="text-purple-200 text-xs font-medium uppercase tracking-widest mb-1">Confirmar inscripción</p>
          <h1 className="text-white text-xl font-bold leading-tight">{workshop.titulo}</h1>
          {esClasePrueba && (
            <span className="inline-block mt-2 bg-white/20 text-white text-xs font-semibold px-3 py-0.5 rounded-full">
              🎟️ Clase de prueba
            </span>
          )}
        </div>

        <div className="p-6 space-y-5">

          {/* Plan elegido — recurrente con paquetes */}
          {paqueteSel && (
            <div className="flex items-start gap-3 bg-purple-50 border border-purple-200 rounded-xl p-4">
              <div className="text-2xl leading-none mt-0.5">🎟️</div>
              <div>
                <p className="text-xs text-purple-600 font-semibold uppercase tracking-wide mb-0.5">Plan elegido</p>
                <p className="text-sm font-semibold text-gray-800">{paqueteSel.nombre}</p>
                <p className="text-sm text-purple-700 font-medium mt-0.5">{paqueteSel.sesionesIncluidas} sesiones · {paqueteSel.duracionDias} días</p>
              </div>
            </div>
          )}

          {/* Fecha y hora — puntual */}
          {esPuntual && fechaLabel && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="text-2xl leading-none mt-0.5">📅</div>
              <div>
                <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide mb-0.5">Fecha y hora</p>
                <p className="text-sm font-semibold text-gray-800 capitalize">{fechaLabel}</p>
                {horaLabel && <p className="text-sm text-amber-700 font-medium mt-0.5">🕐 {horaLabel}</p>}
              </div>
            </div>
          )}

          {/* Selector de slot si tiene slots (recurrente) */}
          {!esPuntual && workshop.slots && workshop.slots.length > 0 && (
            <SlotCalendarPicker
              slots={workshop.slots}
              fechaInicio={workshop.fechaInicio}
              selectedSlotIndex={selectedSlotIdx}
              selectedFecha={selectedFecha}
              cupoPorSesion={workshop.cupoPorSesion}
              onSelect={(slotIndex, fecha) => { setSelectedSlotIdx(slotIndex); setSelectedFecha(fecha) }}
            />
          )}

          {/* Sin slots: cupos libres */}
          {!esPuntual && (!workshop.slots || workshop.slots.length === 0) && (
            <p className="text-xs text-gray-400">{workshop.cupoDisponible} cupos disponibles</p>
          )}

          {/* Resumen de pago */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Resumen</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{esClasePrueba ? 'Clase de prueba' : 'Taller completo'}</span>
              <span className="text-xl font-bold text-purple-700">{precioLabel}</span>
            </div>
            {esClasePrueba && (
              <p className="text-xs text-gray-400">1 sesión · sin compromiso de continuidad</p>
            )}
          </div>

          {/* ¿Para quién? */}
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold text-gray-800">¿Quién tomará el taller?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setParaQuien('yo'); setDependentNombre('') }}
                className={`px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                  paraQuien === 'yo'
                    ? 'border-purple-500 bg-purple-50 text-purple-800 font-medium'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                Yo mismo/a
              </button>
              <button
                type="button"
                onClick={() => setParaQuien('otro')}
                className={`px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                  paraQuien === 'otro'
                    ? 'border-purple-500 bg-purple-50 text-purple-800 font-medium'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                Mi hijo/a u otra persona
              </button>
            </div>
            {paraQuien === 'otro' && (
              <div className="space-y-2 bg-purple-50 rounded-xl p-3">
                <input
                  type="text"
                  placeholder="Nombre completo de quien asistirá *"
                  value={dependentNombre}
                  onChange={e => setDependentNombre(e.target.value)}
                  maxLength={100}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                />
                <input
                  type="date"
                  value={dependentFechaNacimiento}
                  onChange={e => setDependentFechaNacimiento(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-600"
                />
                <p className="text-xs text-purple-700">El tallerista verá este nombre en su lista de alumnos.</p>
              </div>
            )}
          </div>

          {/* Datos de invitado */}
          {isGuest && (
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <div>
                <p className="text-sm font-semibold text-gray-800">Tus datos</p>
                <p className="text-xs text-gray-500 mt-1">
                  Te enviaremos un enlace al correo para acceder a tu cuenta tras el pago.
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

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <button
            onClick={handleInscribirse}
            disabled={submitting || (() => {
              if (esPuntual) {
                // puntual: cupo en el slot, no en la raíz
                const cupo = slotPuntual?.cupoDisponible ?? workshop.cupoDisponible ?? 1
                return cupo <= 0
              }
              // recurrente con slots: requiere selección
              if (workshop.slots?.length > 0) return selectedSlotIdx === null
              // sin slots: cupo raíz
              return workshop.cupoDisponible <= 0
            })()}
            className="w-full bg-purple-600 text-white py-3.5 rounded-xl font-bold text-base hover:bg-purple-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {submitting
              ? 'Procesando...'
              : precio === 0
                ? (esClasePrueba ? 'Reservar clase de prueba gratis' : 'Inscribirme gratis')
                : `Pagar ${precioLabel}`}
          </button>

          <button
            onClick={() => router.back()}
            className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
          >
            ← Volver al taller
          </button>
        </div>
      </div>
    </div>
  )
}
