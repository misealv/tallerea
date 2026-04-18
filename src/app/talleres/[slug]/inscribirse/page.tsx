'use client'

export const dynamic = 'force-dynamic'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

interface Workshop {
  _id: string
  titulo: string
  precio: number
  cupoDisponible: number
  fechaInicio: string
  horarios: { dia: string; horaInicio: string; horaFin: string }[]
}

export default function InscribirsePage({ params }: { params: Promise<{ slug: string }> }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [workshop, setWorkshop] = useState<Workshop | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [slug, setSlug] = useState('')

  useEffect(() => {
    params.then(p => setSlug(p.slug))
  }, [params])

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

  useEffect(() => {
    if (status === 'unauthenticated') router.push(`/login?callbackUrl=/talleres/${slug}/inscribirse`)
  }, [status, router, slug])

  const handleInscribirse = async () => {
    if (!workshop || !session) return
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshopId: workshop._id }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al inscribirse')
        setSubmitting(false)
        return
      }

      // Si es gratis, redirigir directo
      if (data.free) {
        router.push('/mis-talleres?pago=ok')
        return
      }

      // Redirigir a MercadoPago
      if (data.initPoint) {
        window.location.href = data.initPoint
      }
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

  const diaLabel: Record<string, string> = {
    lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
    viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Confirmar inscripción</h1>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">{workshop.titulo}</h2>

          {workshop.horarios.length > 0 && (
            <div className="text-sm text-gray-600">
              {workshop.horarios.map((h, i) => (
                <p key={i}>{diaLabel[h.dia] || h.dia} {h.horaInicio} — {h.horaFin}</p>
              ))}
            </div>
          )}

          <p className="text-sm text-gray-500">
            Inicio: {new Date(workshop.fechaInicio).toLocaleDateString('es-CL')}
          </p>

          <div className="border-t border-gray-100 pt-3">
            <div className="flex justify-between text-lg">
              <span className="font-medium">Total</span>
              <span className="font-bold text-purple-700">
                {workshop.precio === 0 ? 'Gratis' : `$${workshop.precio.toLocaleString('es-CL')}`}
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            {workshop.cupoDisponible} cupos disponibles
          </p>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

        <button
          onClick={handleInscribirse}
          disabled={submitting || workshop.cupoDisponible <= 0}
          className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {submitting
            ? 'Procesando...'
            : workshop.precio === 0
            ? 'Inscribirme gratis'
            : `Pagar $${workshop.precio.toLocaleString('es-CL')}`}
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
