'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

interface Paquete {
  _id: string
  nombre: string
  precio: number
  sesionesIncluidas: number
  duracionDias: number
  activo: boolean
}

interface ClasePrueba {
  habilitada: boolean
  precio: number
}

interface Props {
  workshopId: string
  workshopSlug: string
  modeloAcceso: 'puntual' | 'recurrente'
  modalidadPrecio: 'gratuito' | 'fijo' | 'voluntario' | 'paquetes'
  precioFijo?: number
  aporteVoluntario?: { sugerido: number; minimo: number; maximo: number | null }
  paquetes?: Paquete[]
  clasePrueba?: ClasePrueba
  cupoPorSesion?: number
  plan?: { sesionesIncluidas: number; vigencia: string } | null
}

const CLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

export default function PrecioCard({
  workshopId,
  workshopSlug,
  modeloAcceso,
  modalidadPrecio,
  precioFijo,
  aporteVoluntario,
  paquetes,
  clasePrueba,
  cupoPorSesion,
  plan,
}: Props) {
  const router = useRouter()

  // Estado para paquetes
  const activePaquetes = (paquetes ?? []).filter(p => p.activo)
  const [paqueteSeleccionado, setPaqueteSeleccionado] = useState<string>(activePaquetes[0]?._id ?? '')
  const [verMasPaquetes, setVerMasPaquetes] = useState(false)

  // Estado para voluntario
  const sugerido = aporteVoluntario?.sugerido ?? 0
  const [montoVoluntario, setMontoVoluntario] = useState<string>(String(sugerido))

  const { data: session } = useSession()
  const isGuest = !session?.user

  // Consultar si el alumno autenticado ya compró este taller
  const [accessStatus, setAccessStatus] = useState<{
    loading: boolean
    enrolled: boolean
    subscribed: boolean
  }>({ loading: !!session?.user, enrolled: false, subscribed: false })

  useEffect(() => {
    if (!session?.user) {
      setAccessStatus({ loading: false, enrolled: false, subscribed: false })
      return
    }
    let cancelled = false
    setAccessStatus(s => ({ ...s, loading: true }))
    fetch(`/api/users/me/workshop-access?workshopId=${encodeURIComponent(workshopId)}`)
      .then(r => r.ok ? r.json() : { enrolled: false, subscribed: false })
      .then(data => {
        if (cancelled) return
        setAccessStatus({
          loading: false,
          enrolled: !!data.enrolled,
          subscribed: !!data.subscribed,
        })
      })
      .catch(() => {
        if (!cancelled) setAccessStatus({ loading: false, enrolled: false, subscribed: false })
      })
    return () => { cancelled = true }
  }, [session?.user, workshopId])

  const yaInscrito = accessStatus.enrolled || accessStatus.subscribed

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')

  // ── Checkout suscripción (recurrente) ────────────────────────────────
  async function handleSubscribir() {
    // Invitado: validar campos antes de continuar
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
    setLoading(true)
    setError('')
    try {
      const body: Record<string, unknown> = { workshopId }
      if (modalidadPrecio === 'paquetes' && paqueteSeleccionado) {
        body.paqueteId = paqueteSeleccionado
      }
      if (isGuest) {
        body.name = guestName.trim()
        body.email = guestEmail.trim()
      }
      const res = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al suscribirse')
        return
      }
      if (data.free) { router.push(isGuest ? '/?pago=ok&revisa=email' : '/alumno?pago=ok'); return }
      if (data.initPoint) { window.location.href = data.initPoint; return }
    } finally {
      setLoading(false)
    }
  }

  // ── Clase de prueba ──────────────────────────────────────────────────
  // Siempre redirigir a /inscribirse para que el alumno seleccione el slot.
  // Esto garantiza que el slotIndex llegue al backend, se descuente el cupo
  // y el calendario del tallerista se actualice correctamente.
  function handleClasePrueba() {
    router.push(`/talleres/${workshopSlug}/inscribirse?clasePrueba=true`)
  }

  // ── Render precio ────────────────────────────────────────────────────
  const renderPrecio = () => {
    if (modalidadPrecio === 'gratuito') {
      return <p className="text-3xl font-bold text-green-600">Gratis</p>
    }
    if (modalidadPrecio === 'fijo') {
      return (
        <p className="text-3xl font-bold text-purple-700">
          {(precioFijo ?? 0) === 0 ? 'Gratis' : CLP(precioFijo ?? 0)}
        </p>
      )
    }
    if (modalidadPrecio === 'voluntario' && aporteVoluntario) {
      const av = aporteVoluntario
      return (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">Aporte sugerido</p>
          <p className="text-2xl font-bold text-purple-700">{CLP(av.sugerido)}</p>
          <p className="text-xs text-gray-400">
            Mínimo {CLP(av.minimo)}{av.maximo ? ` · Máximo ${CLP(av.maximo)}` : ''}
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tu aporte (CLP)</label>
            <input
              type="number"
              min={av.minimo}
              max={av.maximo ?? undefined}
              step={1}
              value={montoVoluntario}
              onChange={e => setMontoVoluntario(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>
      )
    }
    if (modalidadPrecio === 'paquetes' && activePaquetes.length > 0) {
      const paquetesVisibles = verMasPaquetes ? activePaquetes : activePaquetes.slice(0, 2)
      const hayMas = activePaquetes.length > 2
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Elige tu plan</p>
          {paquetesVisibles.map(pq => (
            <label
              key={pq._id}
              className={`flex items-center gap-3 border-2 rounded-lg p-3 cursor-pointer transition-colors ${
                paqueteSeleccionado === pq._id ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="paquete"
                value={pq._id}
                checked={paqueteSeleccionado === pq._id}
                onChange={() => setPaqueteSeleccionado(pq._id)}
                className="accent-purple-600"
              />
              <div className="flex-1">
                <p className="font-medium text-sm">{pq.nombre}</p>
                <p className="text-xs text-gray-500">{pq.sesionesIncluidas} sesiones · {pq.duracionDias} días</p>
              </div>
              <p className="font-bold text-purple-700 text-sm">{CLP(pq.precio)}</p>
            </label>
          ))}
          {hayMas && (
            <button
              onClick={() => setVerMasPaquetes(v => !v)}
              className="w-full text-xs text-purple-600 hover:text-purple-800 py-1 transition-colors"
            >
              {verMasPaquetes ? '▲ Ver menos planes' : `▼ Ver más planes (${activePaquetes.length - 2} más)`}
            </button>
          )}
        </div>
      )
    }
    return null
  }

  // ── Render CTA principal ─────────────────────────────────────────────
  const renderCTA = () => {
    // Si el alumno ya compró el taller, ocultar el botón de inscripción/suscripción
    // y mostrar acceso directo al hub "Mis talleres"
    if (yaInscrito) {
      const label = accessStatus.subscribed ? 'Ya tienes una suscripción activa' : 'Ya estás inscrito en este taller'
      return (
        <div className="space-y-2">
          <div className="w-full text-center bg-green-50 border border-green-200 text-green-800 py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            {label}
          </div>
          <Link
            href="/alumno/mis-talleres"
            className="block w-full text-center bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors"
          >
            Ir a mis talleres →
          </Link>
        </div>
      )
    }

    // Mientras verificamos el estado del alumno autenticado, deshabilitar para
    // evitar mostrar/clickear "Inscribirme" antes de saber si ya compró.
    if (accessStatus.loading) {
      return (
        <div className="w-full text-center bg-gray-100 text-gray-400 py-3 rounded-lg font-semibold">
          Cargando…
        </div>
      )
    }

    if (modeloAcceso === 'recurrente') {
      const disabled = loading || (modalidadPrecio === 'paquetes' && !paqueteSeleccionado)
      const label = modalidadPrecio === 'gratuito'
        ? 'Inscribirse gratis'
        : loading ? 'Procesando…' : 'Suscribirme'
      return (
        <button
          onClick={handleSubscribir}
          disabled={disabled}
          className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {label}
        </button>
      )
    }

    // puntual — fijo/voluntario/gratuito
    if (modalidadPrecio === 'voluntario' && aporteVoluntario) {
      const monto = Math.round(Number(montoVoluntario)) || aporteVoluntario.sugerido
      return (
        <Link
          href={`/talleres/${workshopSlug}/inscribirse?montoVoluntario=${monto}`}
          className="block w-full text-center bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors"
        >
          {monto === 0 ? 'Inscribirme gratis' : `Pagar ${CLP(monto)}`}
        </Link>
      )
    }

    const hasCupo = (cupoPorSesion ?? 0) > 0
    if (!hasCupo) {
      return (
        <div className="w-full text-center bg-gray-200 text-gray-500 py-3 rounded-lg font-semibold">
          Sin cupos
        </div>
      )
    }
    return (
      <Link
        href={`/talleres/${workshopSlug}/inscribirse`}
        className="block w-full text-center bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors"
      >
        {(modalidadPrecio === 'gratuito' || precioFijo === 0) ? 'Inscribirme gratis' : 'Inscribirme'}
      </Link>
    )
  }

  // ── Plan info (recurrente) ────────────────────────────────────────────
  const renderPlanInfo = () => {
    if (modalidadPrecio === 'paquetes') {
      const pq = activePaquetes.find(p => p._id === paqueteSeleccionado)
      if (!pq) return null
      return (
        <div className="text-xs text-center text-gray-500 border-t pt-3">
          {pq.sesionesIncluidas} {pq.sesionesIncluidas !== 1 ? 'sesiones' : 'sesión'} · {pq.duracionDias} {pq.duracionDias !== 1 ? 'días' : 'día'} por ciclo
        </div>
      )
    }
    if (plan) {
      return (
        <div className="text-xs text-center text-gray-500 border-t pt-3">
          {plan.sesionesIncluidas} sesión{plan.sesionesIncluidas !== 1 ? 'es' : ''} ·{' '}
          {plan.vigencia === 'mensual' ? 'renueva mensual' : plan.vigencia === 'por_ciclo' ? 'por ciclo' : 'sin vencimiento'}
        </div>
      )
    }
    return null
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-20 space-y-4">
      {renderPrecio()}
      {renderPlanInfo()}
      {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
      {/* Formulario de invitado para suscripciones recurrentes */}
      {modeloAcceso === 'recurrente' && isGuest && (
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium text-gray-700">Tus datos</p>
          <p className="text-xs text-gray-500">
            Recibirás un enlace mágico al correo para acceder a tus clases tras el pago.
          </p>
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
            <a href={`/login?callbackUrl=/talleres/${workshopSlug}`} className="text-purple-600 hover:underline">
              Inicia sesión
            </a>
          </p>
        </div>
      )}

      {renderCTA()}

      {/* Clase de prueba */}
      {clasePrueba?.habilitada && (
        <button
          onClick={handleClasePrueba}
          disabled={loading}
          className="w-full border border-purple-300 text-purple-700 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-50 disabled:opacity-50 transition-colors"
        >
          {clasePrueba.precio === 0
            ? 'Asistir a clase de prueba gratuita'
            : `Clase de prueba — ${CLP(clasePrueba.precio)}`}
        </button>
      )}

    </div>
  )
}
