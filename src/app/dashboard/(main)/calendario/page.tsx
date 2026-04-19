'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import WeeklyCalendar from '@/components/WeeklyCalendar'

interface Workshop {
  _id: string
  titulo: string
  slots: {
    dia: string; horaInicio: string; horaFin: string
    fecha?: string; reservas: number; cancelado: boolean
  }[]
  cupoPorSesion: number
}

interface Booking {
  _id: string
  studentId: { _id: string; name: string; email: string }
  estado: 'reservada' | 'asistio' | 'no_asistio' | 'cancelada'
  slotIndex: number
}

export default function CalendarioPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [selectedWs, setSelectedWs] = useState('')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  const accountId = typeof document !== 'undefined'
    ? document.getElementById('accountId')?.getAttribute('value') || ''
    : ''

  const fetchWorkshops = useCallback(async () => {
    if (!accountId) return
    const res = await fetch(`/api/workshops?accountId=${accountId}&limit=100`)
    const data = await res.json()
    const ws = data.data || []
    setWorkshops(ws)
    if (ws.length > 0) setSelectedWs(ws[0]._id)
    setLoading(false)
  }, [accountId])

  useEffect(() => { fetchWorkshops() }, [fetchWorkshops])

  const fetchBookings = useCallback(async () => {
    if (!selectedWs) return
    const res = await fetch(`/api/bookings?workshopId=${selectedWs}&limit=200`)
    if (res.ok) {
      const data = await res.json()
      setBookings(data.data || [])
    }
  }, [selectedWs])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  async function handleMarkAttendance(bookingId: string, estado: 'asistio' | 'no_asistio') {
    await fetch(`/api/bookings/${bookingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    fetchBookings()
  }

  const currentWs = workshops.find(w => w._id === selectedWs)

  if (loading) return <div className="text-gray-500">Cargando calendario...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Calendario</h1>
        {workshops.length > 1 && (
          <select value={selectedWs} onChange={e => setSelectedWs(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            {workshops.map(w => (
              <option key={w._id} value={w._id}>{w.titulo}</option>
            ))}
          </select>
        )}
      </div>

      {!currentWs ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
          No tienes talleres con sesiones programadas.
        </div>
      ) : (
        <WeeklyCalendar
          slots={currentWs.slots}
          bookings={bookings}
          cupoPorSesion={currentWs.cupoPorSesion}
          workshopId={currentWs._id}
          onMarkAttendance={handleMarkAttendance}
        />
      )}
    </div>
  )
}
