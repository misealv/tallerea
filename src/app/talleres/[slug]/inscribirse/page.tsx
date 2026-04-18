'use client'

export const dynamic = 'force-dynamic'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import SlotSelector from '@/components/SlotSelector'

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
  cupoDisponible: number
  cupoMax: number
  fechaInicio: string
  slots: Slot[]
}

export default function InscribirsePage({ params }: { params: Promise<{ slug: string }> }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [workshop, setWorkshop] = useState<Workshop | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [slug, setSlug] = useState('')
  const [selectedSlots, setSelectedSlots] = useState<number[]>([])
  const [currentSlotIdx, setCurrentSlotIdx] = useState(0)

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
    const hasSlots = workshop.slots && workshop.slots.length > 0

    // Si tiene slots, validar selección
    if (hasSlots && selectedSlots.length === 0) {
      setError('Selecciona al menos un horario')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      // Si hay múltiples slots seleccionados, inscribir uno por uno
      const slotsToEnroll = hasSlots ? selectedSlots : [null]

      for (let i = 0; i < slotsToEnroll.length; i++) {
        setCurrentSlotIdx(i)
        const res = await fetch('/api/payments/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workshopId: workshop._id,
            slotIndex: slotsToEnroll[i],
          }),
        })
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Error al inscribirse')
          setSubmitting(false)
          return
        }

        // Si es gratis y es el último, redirigir
        if (data.free && i === slotsToEnroll.length - 1) {
          router.push('/mis-talleres?pago=ok')
          return
        }

        // Si tiene pago, redirigir a MercadoPago (solo primer slot con pago)
        if (data.initPoint) {
          window.location.href = data.initPoint
          return
        }
      }

      router.push('/mis-talleres?pago=ok')
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
            <SlotSelector slots={workshop.slots} selectedSlots={selectedSlots} onSelectionChange={setSelectedSlots} />
          ) : (
            <p className="text-xs text-gray-400">{workshop.cupoDisponible} cupos disponibles</p>
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
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

        <button
          onClick={handleInscribirse}
          disabled={submitting || (workshop.slots?.length > 0 ? selectedSlots.length === 0 : workshop.cupoDisponible <= 0)}
          className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {submitting
            ? `Procesando${selectedSlots.length > 1 ? ` (${currentSlotIdx + 1}/${selectedSlots.length})` : ''}...`
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
