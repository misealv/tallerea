'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import SubscriptionCard from '@/components/SubscriptionCard'
import BookingDetail from '@/components/BookingDetail'

interface Subscription {
  _id: string
  workshopId: { _id: string; titulo: string; slug: string }
  estado: 'activa' | 'vencida' | 'cancelada'
  sesionesTotales: number
  sesionesUsadas: number
  sesionesDisponibles: number
  fechaVencimiento: string
  monto: number
}

interface Booking {
  _id: string
  workshopId: { titulo: string; slug: string }
  fecha: string
  estado: string
  slotIndex: number
}

export default function SuscripcionesPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [sRes, bRes] = await Promise.all([
        fetch('/api/subscriptions'),
        fetch('/api/bookings?limit=50'),
      ])
      if (sRes.ok) {
        const sData = await sRes.json()
        setSubscriptions(sData.data || [])
      }
      if (bRes.ok) {
        const bData = await bRes.json()
        setBookings(bData.data || [])
      }
    } catch {
      // Silenciar
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleCancel(id: string) {
    if (!confirm('¿Cancelar esta suscripción?')) return
    await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' })
    fetchData()
  }

  async function handleRenew(id: string) {
    const res = await fetch(`/api/subscriptions/${id}/renew`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      if (data.initPoint) window.location.href = data.initPoint
      else fetchData()
    }
  }

  async function handleCancelBooking(id: string) {
    if (!confirm('¿Cancelar esta reserva?')) return
    await fetch(`/api/bookings/${id}`, { method: 'DELETE' })
    fetchData()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleChangeSlot(bookingId: string) {
    // TODO: abrir modal para seleccionar nuevo slot
    alert('Funcionalidad de cambio de sesión próximamente')
  }

  if (loading) return <div className="text-gray-500 p-8">Cargando suscripciones...</div>

  return (
    <div className="space-y-8">
      {/* Suscripciones */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Mis suscripciones</h2>
        {subscriptions.length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
            No tienes suscripciones activas.
          </div>
        ) : (
          <div className="space-y-3">
            {subscriptions.map(sub => (
              <SubscriptionCard
                key={sub._id}
                subscription={sub}
                onCancel={handleCancel}
                onRenew={handleRenew}
              />
            ))}
          </div>
        )}
      </div>

      {/* Próximas reservas */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Próximas sesiones</h2>
        {bookings.filter(b => b.estado === 'reservada').length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500 text-sm">
            No tienes sesiones reservadas.
          </div>
        ) : (
          <div className="space-y-2">
            {bookings
              .filter(b => b.estado === 'reservada')
              .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
              .map(b => (
                <BookingDetail
                  key={b._id}
                  booking={b}
                  onCancel={handleCancelBooking}
                  onChangeSlot={handleChangeSlot}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
