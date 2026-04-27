'use client'

import { useState } from 'react'
import CalendarGridAlumno, { type CalendarSlot } from './CalendarGridAlumno'

export type { CalendarSlot }

interface Props {
  subscriptionId: string
  workshopId: string
  workshopSlug: string
  sesionesDisponibles: number
  fechaVencimiento: string
  allSlots: CalendarSlot[]
}

function getMonday(d: Date): Date {
  // Usar UTC para evitar desfase por zona horaria Chile (UTC-3/UTC-4)
  const dayUTC = d.getUTCDay()
  const diff = dayUTC === 0 ? -6 : 1 - dayUTC
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff))
}

function slotsBetween(slots: CalendarSlot[], from: Date, to: Date): CalendarSlot[] {
  return slots.filter(s => {
    const f = new Date(s.fecha)
    return f >= from && f < to
  })
}

export default function ReservasCalendar({
  subscriptionId, workshopId, workshopSlug, sesionesDisponibles, fechaVencimiento, allSlots,
}: Props) {
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))

  // Aritmética en ms para evitar drift por DST y por uso de getDate() local sobre fecha UTC
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000)

  const visibleSlots = slotsBetween(allSlots, weekStart, weekEnd)

  function handleWeekChange(delta: number) {
    setWeekStart(prev => new Date(prev.getTime() + delta * 7 * 86400000))
  }

  const vence = new Date(fechaVencimiento)

  return (
    <div className="space-y-4">
      {/* Indicador de sesiones */}
      <div className="flex items-center justify-between bg-purple-50 dark:bg-purple-900/20 rounded-xl px-4 py-3">
        <div>
          <span className="text-sm font-medium text-purple-900 dark:text-purple-200">
            {sesionesDisponibles} sesión{sesionesDisponibles !== 1 ? 'es' : ''} disponible{sesionesDisponibles !== 1 ? 's' : ''}
          </span>
          <span className="text-xs text-purple-600 dark:text-purple-400 ml-2">
            · vence {vence.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
        <a
          href={`/alumno/suscripciones`}
          className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
        >
          Ver suscripción →
        </a>
      </div>

      {sesionesDisponibles === 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm px-4 py-3 rounded-xl">
          Sin sesiones disponibles. <a href={`/talleres/${workshopSlug}`} className="underline">Renovar suscripción →</a>
        </div>
      )}

      <CalendarGridAlumno
        weekStart={weekStart}
        slots={visibleSlots}
        sesionesDisponibles={sesionesDisponibles}
        subscriptionId={subscriptionId}
        workshopId={workshopId}
        onWeekChange={handleWeekChange}
      />

      {visibleSlots.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
          No hay sesiones programadas esta semana.
        </p>
      )}
    </div>
  )
}
