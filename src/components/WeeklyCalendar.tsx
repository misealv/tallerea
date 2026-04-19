'use client'

import { useState } from 'react'

interface Slot {
  dia: string
  horaInicio: string
  horaFin: string
  fecha?: string
  reservas: number
  cancelado: boolean
}

interface BookingData {
  _id: string
  studentId: { _id: string; name: string; email: string }
  estado: 'reservada' | 'asistio' | 'no_asistio' | 'cancelada'
  slotIndex: number
}

interface WeeklyCalendarProps {
  slots: Slot[]
  bookings: BookingData[]
  cupoPorSesion: number
  workshopId: string
  onMarkAttendance: (bookingId: string, estado: 'asistio' | 'no_asistio') => void
}

const DIA_LABEL: Record<string, string> = {
  lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue',
  viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom',
}

const ESTADO_BADGE: Record<string, { bg: string; label: string }> = {
  reservada: { bg: 'bg-blue-100 text-blue-700', label: 'Reservada' },
  asistio: { bg: 'bg-green-100 text-green-700', label: 'Asistió' },
  no_asistio: { bg: 'bg-red-100 text-red-600', label: 'No asistió' },
  cancelada: { bg: 'bg-gray-100 text-gray-500', label: 'Cancelada' },
}

export default function WeeklyCalendar({
  slots, bookings, cupoPorSesion, onMarkAttendance,
}: WeeklyCalendarProps) {
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null)

  // Filtrar solo slots futuros o de hoy
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-3">
      {slots.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
          No hay sesiones programadas.
        </div>
      )}

      {slots.map((slot, idx) => {
        const slotBookings = bookings.filter(b => b.slotIndex === idx && b.estado !== 'cancelada')
        const fechaStr = slot.fecha?.slice(0, 10)
        const isPast = fechaStr ? fechaStr < today : false
        const isExpanded = expandedSlot === idx

        return (
          <div
            key={idx}
            className={`bg-white rounded-xl border ${slot.cancelado ? 'border-red-200 opacity-60' : 'border-gray-200'}`}
          >
            {/* Header del slot */}
            <button
              onClick={() => setExpandedSlot(isExpanded ? null : idx)}
              className="w-full p-4 flex justify-between items-center text-left"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                  isPast ? 'bg-gray-100 text-gray-400' : 'bg-purple-100 text-purple-700'
                }`}>
                  {DIA_LABEL[slot.dia]?.slice(0, 2) || slot.dia.slice(0, 2)}
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {DIA_LABEL[slot.dia]} {slot.horaInicio} — {slot.horaFin}
                  </p>
                  {fechaStr && (
                    <p className="text-xs text-gray-500">{new Date(fechaStr).toLocaleDateString('es-CL')}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  {slotBookings.length}/{cupoPorSesion}
                </span>
                {slot.cancelado && (
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Cancelada</span>
                )}
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Detalle con bookings */}
            {isExpanded && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {slotBookings.length === 0 ? (
                  <div className="p-4 text-sm text-gray-400">Sin reservas en esta sesión</div>
                ) : (
                  slotBookings.map(b => (
                    <div key={b._id} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{b.studentId?.name || 'Sin nombre'}</p>
                        <p className="text-xs text-gray-500">{b.studentId?.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_BADGE[b.estado]?.bg}`}>
                          {ESTADO_BADGE[b.estado]?.label}
                        </span>
                        {b.estado === 'reservada' && isPast && (
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); onMarkAttendance(b._id, 'asistio') }}
                              className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                            >
                              ✓
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onMarkAttendance(b._id, 'no_asistio') }}
                              className="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
                            >
                              ✗
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
