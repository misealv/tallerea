'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const HORA_INI = 7
const HORA_FIN = 22
const CELL_H = 32 // px por 30 min
const DIAS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
// Lunes=0..Dom=6 en nuestra grilla; Date.getDay() Dom=0,Lun=1,...
const GRID_DAY_IDX = [1, 2, 3, 4, 5, 6, 0] // lunes..domingo

function minutesToTop(horaInicio: string): number {
  const [h, m] = horaInicio.split(':').map(Number)
  return ((h * 60 + m - HORA_INI * 60) / 30) * CELL_H
}

function durationToHeight(horaInicio: string, horaFin: string): number {
  const [hi, mi] = horaInicio.split(':').map(Number)
  const [hf, mf] = horaFin.split(':').map(Number)
  const mins = (hf * 60 + mf) - (hi * 60 + mi)
  return Math.max((mins / 30) * CELL_H, CELL_H)
}

export interface CalendarSlot {
  index: number
  horaInicio: string
  horaFin: string
  fecha: string      // ISO string
  reservas: number
  cancelado: boolean
  cupoMax: number
  miReservaId?: string  // si ya reservé este slot
}

interface Props {
  weekStart: Date    // lunes de la semana visible
  slots: CalendarSlot[]
  sesionesDisponibles: number
  subscriptionId: string
  workshopId: string
  onWeekChange: (delta: number) => void
}

export default function CalendarGridAlumno({
  weekStart, slots, sesionesDisponibles, subscriptionId, workshopId, onWeekChange,
}: Props) {
  const [confirming, setConfirming] = useState<CalendarSlot | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError] = useState('')
  const router = useRouter()

  // Selector de dependiente en el modal de reserva
  const [dependents, setDependents] = useState<{ _id: string; nombre: string }[]>([])
  const [selectedDependent, setSelectedDependent] = useState<string>('') // '' = alumno titular

  // Cargar dependientes al abrir el modal
  function openConfirm(slot: CalendarSlot) {
    setActionError('')
    setSelectedDependent('')
    setConfirming(slot)
    // Cargar dependientes del usuario en segundo plano
    fetch('/api/users/me/dependents')
      .then(r => r.json())
      .then((data: { _id: string; nombre: string }[]) => {
        if (Array.isArray(data)) setDependents(data)
      })
      .catch(() => null)
  }

  // Construir los 7 días de la semana visible (aritmética en ms para mantener UTC)
  const weekDays = GRID_DAY_IDX.map((dayOfWeek, i) => {
    const d = new Date(weekStart.getTime() + i * 86400000)
    return { date: d, dayOfWeek }
  })

  // Clasificar slots por columna (día de la semana) dentro de la semana visible
  const slotsByDay = new Map<number, CalendarSlot[]>()
  for (const s of slots) {
    const d = new Date(s.fecha)
    const dow = d.getUTCDay() // 0=Dom..6=Sáb (UTC — servidor en UTC timezone)
    const col = GRID_DAY_IDX.indexOf(dow)
    if (col >= 0) {
      const list = slotsByDay.get(col) ?? []
      list.push(s)
      slotsByDay.set(col, list)
    }
  }

  async function handleReserve() {
    if (!confirming) return
    setActionError('')
    const body: Record<string, unknown> = { subscriptionId, workshopId, slotIndex: confirming.index }
    if (selectedDependent) body.dependentId = selectedDependent
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) { setActionError(data.error || 'Error al reservar'); return }
    setConfirming(null)
    startTransition(() => router.refresh())
  }

  async function handleCancel() {
    if (!cancelling) return
    setActionError('')
    const res = await fetch(`/api/bookings/${cancelling}/cancel`, { method: 'PATCH' })
    const data = await res.json()
    if (!res.ok) { setActionError(data.error || 'Error al cancelar'); return }
    setCancelling(null)
    startTransition(() => router.refresh())
  }

  const today = new Date()

  return (
    <div className="space-y-2">
      {/* Navegación de semana */}
      <div className="flex items-center justify-between py-1">
        <button onClick={() => onWeekChange(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors">← Anterior</button>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {weekStart.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', timeZone: 'UTC' })} –{' '}
          {weekDays[6].date.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}
        </span>
        <button onClick={() => onWeekChange(1)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors">Siguiente →</button>
      </div>

      {actionError && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{actionError}</p>
      )}

      {/* Grilla */}
      <div className="overflow-x-auto border border-gray-300 dark:border-gray-600 rounded-xl">
        <div className="min-w-[640px]">
          {/* Header días */}
          <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
            <div />
            {weekDays.map((wd, i) => {
              // Comparar fecha UTC de la columna con la fecha local actual del usuario
              const isToday =
                wd.date.getUTCFullYear() === today.getFullYear() &&
                wd.date.getUTCMonth() === today.getMonth() &&
                wd.date.getUTCDate() === today.getDate()
              return (
                <div key={i} className={`py-2 text-center text-xs font-medium ${isToday ? 'text-purple-700 dark:text-purple-400' : 'text-gray-600 dark:text-gray-400'}`}>
                  <div>{DIAS_SHORT[i]}</div>
                  <div className={`mt-0.5 w-7 h-7 mx-auto flex items-center justify-center rounded-full text-sm font-semibold ${
                    isToday ? 'bg-purple-600 text-white' : 'text-gray-800 dark:text-gray-200'}`}>
                    {wd.date.getUTCDate()}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Celdas + slots */}
          <div className="relative bg-white dark:bg-gray-900" style={{ height: (HORA_FIN - HORA_INI) * 2 * CELL_H }}>
            {/* Líneas de hora */}
            {Array.from({ length: HORA_FIN - HORA_INI }, (_, i) => (
              <div key={i} className="absolute left-0 right-0 border-t border-gray-300 dark:border-gray-600 flex"
                style={{ top: i * 2 * CELL_H }}>
                <span className="text-[10px] text-gray-500 dark:text-gray-400 w-12 text-right pr-1 -mt-2 select-none font-medium">
                  {String(HORA_INI + i).padStart(2, '0')}:00
                </span>
              </div>
            ))}

            {/* Columnas de días (fondo) */}
            {weekDays.map((_, colIdx) => (
              <div key={colIdx} className="absolute top-0 bottom-0 border-l border-gray-300 dark:border-gray-600"
                style={{ left: `calc(48px + ${colIdx} * ((100% - 48px) / 7))`, width: `calc((100% - 48px) / 7)` }} />
            ))}

            {/* Bloques de slots */}
            {weekDays.map((_, colIdx) => {
              const colSlots = slotsByDay.get(colIdx) ?? []
              return colSlots.map((slot) => {
                const top = minutesToTop(slot.horaInicio)
                const height = durationToHeight(slot.horaInicio, slot.horaFin)
                const colW = `calc((100% - 48px) / 7)`
                const left = `calc(48px + ${colIdx} * ${colW})`
                const isMio = !!slot.miReservaId
                const lleno = slot.reservas >= slot.cupoMax
                // Comparar fecha+horaFin (no solo medianoche UTC) para que los slots
                // de hoy que aún no terminaron sean reservables
                const [hf, mf] = (slot.horaFin ?? '23:59').split(':').map(Number)
                const slotEndDate = new Date(slot.fecha)
                slotEndDate.setUTCHours(hf, mf, 0, 0)
                const pasado = slotEndDate < today
                const cancelado = slot.cancelado

                let colorClass = 'bg-green-500 hover:bg-green-600 cursor-pointer'
                if (isMio)     colorClass = 'bg-blue-500 hover:bg-blue-600 cursor-pointer'
                if (lleno)     colorClass = 'bg-gray-300 dark:bg-gray-600 cursor-default'
                if (cancelado) colorClass = 'bg-red-200 dark:bg-red-900/60 cursor-default'
                if (pasado)    colorClass = 'bg-gray-200 dark:bg-gray-700 cursor-default'

                return (
                  <div key={slot.index}
                    className={`absolute rounded-md text-white text-xs px-1.5 py-0.5 overflow-hidden transition-colors z-10 ${colorClass}`}
                    style={{ top: top + 1, height: height - 2, left, width: `calc(${colW} - 2px)` }}
                    onClick={() => {
                      if (pasado || cancelado) return
                      if (isMio) { setActionError(''); setCancelling(slot.miReservaId!); return }
                      if (!lleno && sesionesDisponibles > 0) { setActionError(''); openConfirm(slot) }
                    }}
                  >
                    <div className="font-semibold truncate">{slot.horaInicio}</div>
                    {height > CELL_H && (
                      <div className="opacity-90 truncate">
                        {isMio ? '✓ Reservado' : lleno ? 'Lleno' : cancelado ? 'Cancelado' : `${slot.cupoMax - slot.reservas} libre${slot.cupoMax - slot.reservas !== 1 ? 's' : ''}`}
                      </div>
                    )}
                  </div>
                )
              })
            })}
          </div>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400 pt-1">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Disponible</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Mi reserva</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-300 dark:bg-gray-600 inline-block" /> Lleno</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 dark:bg-red-900/60 inline-block" /> Cancelado</span>
      </div>

      {/* Modal confirmar reserva */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50" onClick={() => setConfirming(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 w-80 space-y-4 border border-transparent dark:border-gray-700" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 dark:text-white">Confirmar reserva</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {new Date(confirming.fecha).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}<br />
              {confirming.horaInicio} – {confirming.horaFin}
            </p>
            {/* Selector de dependiente */}
            {dependents.length > 0 && (
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">¿Quién toma esta clase?</label>
                <select
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
                  value={selectedDependent}
                  onChange={e => setSelectedDependent(e.target.value)}
                >
                  <option value="">Yo mismo/a</option>
                  {dependents.map(d => (
                    <option key={d._id} value={d._id}>{d.nombre}</option>
                  ))}
                </select>
              </div>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">Se descontará 1 sesión de tu suscripción.</p>
            {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
            <div className="flex gap-2">
              <button onClick={handleReserve} disabled={isPending}
                className="flex-1 bg-purple-600 text-white py-2 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50">
                {isPending ? 'Reservando…' : 'Confirmar'}
              </button>
              <button onClick={() => setConfirming(null)}
                className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cancelar reserva */}
      {cancelling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50" onClick={() => setCancelling(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 w-80 space-y-4 border border-transparent dark:border-gray-700" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 dark:text-white">¿Cancelar esta reserva?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">La sesión volverá a tu suscripción si estás dentro del plazo.</p>
            {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
            <div className="flex gap-2">
              <button onClick={handleCancel} disabled={isPending}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">
                {isPending ? 'Cancelando…' : 'Sí, cancelar'}
              </button>
              <button onClick={() => setCancelling(null)}
                className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">
                No, volver
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
