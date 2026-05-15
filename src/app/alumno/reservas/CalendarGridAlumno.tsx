'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { SiblingSubscription } from './ReservasCalendar'

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
  misReservas: { bookingId: string; dependentNombre?: string }[]
}

interface Props {
  weekStart: Date    // lunes de la semana visible
  slots: CalendarSlot[]
  sesionesDisponibles: number
  subscriptionId: string
  workshopId: string
  onWeekChange: (delta: number) => void
  subDependentId?: string    // si la sub tiene dependiente asignado, fijar para reservas
  subDependentNombre?: string
  siblingSubscriptions?: SiblingSubscription[]  // otras subs del mismo taller (apoderado con varios alumnos)
}

export default function CalendarGridAlumno({
  weekStart, slots, sesionesDisponibles, subscriptionId, workshopId, onWeekChange,
  subDependentId, subDependentNombre, siblingSubscriptions,
}: Props) {
  const [confirming, setConfirming] = useState<CalendarSlot | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  // Slot abierto en modo "administrar reservas" (sub sin dependentId con ≥ 1 reserva en el slot)
  const [managing, setManaging] = useState<CalendarSlot | null>(null)
  // Override de suscripción cuando se reserva para una sub hermana desde el modal de gestión
  const [confirmOverride, setConfirmOverride] = useState<{ subscriptionId: string; dependentId?: string; dependentNombre: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError] = useState('')
  const router = useRouter()

  // Selector de dependiente en el modal de reserva
  const [dependents, setDependents] = useState<{ _id: string; nombre: string }[]>([])
  const [selectedDependent, setSelectedDependent] = useState<string>('') // '' = alumno titular

  // Cargar dependientes al abrir el modal
  function openConfirm(slot: CalendarSlot) {
    setActionError('')
    // Si la sub tiene dependiente asignado, preseleccionarlo siempre; no cargar lista
    setSelectedDependent(subDependentId ?? '')
    setConfirming(slot)
    if (!subDependentId) {
      fetch('/api/users/me/dependents')
        .then(r => r.json())
        .then((data: { _id: string; nombre: string }[]) => {
          if (Array.isArray(data)) setDependents(data)
        })
        .catch(() => null)
    }
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
    // Si se está reservando para una sub hermana, usar ese subscriptionId y su dependentId
    const useSub = confirmOverride?.subscriptionId ?? subscriptionId
    const body: Record<string, unknown> = { subscriptionId: useSub, workshopId, slotIndex: confirming.index }
    if (confirmOverride) {
      // Sub hermana: usar dependentId fijo de esa sub si existe
      if (confirmOverride.dependentId) body.dependentId = confirmOverride.dependentId
    } else if (subDependentId) {
      // Sub actual con dependiente fijo
      body.dependentId = subDependentId
    } else if (selectedDependent) {
      // Sub sin dependiente fijo: selector manual
      body.dependentId = selectedDependent
    }
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) { setActionError(data.error || 'Error al reservar'); return }
    setConfirming(null)
    setConfirmOverride(null)
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
                const reservasMias = slot.misReservas?.length ?? 0
                const tieneReservaMia = reservasMias > 0
                const lleno = slot.reservas >= slot.cupoMax
                // Comparar fecha+horaFin (no solo medianoche UTC) para que los slots
                // de hoy que aún no terminaron sean reservables
                const [hf, mf] = (slot.horaFin ?? '23:59').split(':').map(Number)
                const slotEndDate = new Date(slot.fecha)
                slotEndDate.setUTCHours(hf, mf, 0, 0)
                const pasado = slotEndDate < today
                const cancelado = slot.cancelado

                let colorClass = 'bg-green-500 hover:bg-green-600 cursor-pointer'
                if (tieneReservaMia) colorClass = 'bg-blue-500 hover:bg-blue-600 cursor-pointer'
                if (lleno && !tieneReservaMia) colorClass = 'bg-gray-300 dark:bg-gray-600 cursor-default'
                if (cancelado) colorClass = 'bg-red-200 dark:bg-red-900/60 cursor-default'
                if (pasado)    colorClass = 'bg-gray-200 dark:bg-gray-700 cursor-default'

                // Etiqueta interna del bloque
                let label: string
                if (tieneReservaMia) {
                  if (reservasMias === 1) {
                    const n = slot.misReservas[0].dependentNombre
                    label = n ? `✓ ${n.split(' ')[0]}` : '✓ Reservado'
                  } else {
                    label = `✓ ${reservasMias} reservas`
                  }
                } else if (lleno) label = 'Lleno'
                else if (cancelado) label = 'Cancelado'
                else label = `${slot.cupoMax - slot.reservas} libre${slot.cupoMax - slot.reservas !== 1 ? 's' : ''}`

                return (
                  <div key={slot.index}
                    className={`absolute rounded-md text-white text-xs px-1.5 py-0.5 overflow-hidden transition-colors z-10 ${colorClass}`}
                    style={{ top: top + 1, height: height - 2, left, width: `calc(${colW} - 2px)` }}
                    onClick={() => {
                      if (pasado || cancelado) return
                      setActionError('')
                      if (subDependentId) {
                        // Hermanas que aún no reservaron este slot y tienen sesiones disponibles
                        const siblingsNeedSlot = (siblingSubscriptions ?? []).filter(
                          ss => !ss.bookedSlotIndices.includes(slot.index) && ss.sesionesDisponibles > 0
                        )
                        // Abrir modal de gestión si hay reserva propia O hermanas pendientes → multi-alumno
                        if (tieneReservaMia || siblingsNeedSlot.length > 0) { setManaging(slot); return }
                        if (!lleno && sesionesDisponibles > 0) openConfirm(slot)
                        return
                      }
                      // Sub sin dependentId: si ya hay reservas en el slot, abrir gestor
                      if (tieneReservaMia) { setManaging(slot); return }
                      if (!lleno && sesionesDisponibles > 0) openConfirm(slot)
                    }}
                  >
                    <div className="font-semibold truncate">{slot.horaInicio}</div>
                    {height > CELL_H && (
                      <div className="opacity-90 truncate">{label}</div>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50" onClick={() => { setConfirming(null); setConfirmOverride(null) }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 w-80 space-y-4 border border-transparent dark:border-gray-700" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 dark:text-white">Confirmar reserva</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {new Date(confirming.fecha).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}<br />
              {confirming.horaInicio} – {confirming.horaFin}
            </p>
            {/* Selector de dependiente — fijo si la suscripción tiene uno asignado o es override de hermana */}
            {confirmOverride ? (
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg px-3 py-2">
                <p className="text-xs text-purple-600 dark:text-purple-400 mb-0.5">Esta clase es para:</p>
                <p className="text-sm font-semibold text-purple-900 dark:text-purple-200">{confirmOverride.dependentNombre}</p>
              </div>
            ) : subDependentId ? (
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg px-3 py-2">
                <p className="text-xs text-purple-600 dark:text-purple-400 mb-0.5">Esta clase es para:</p>
                <p className="text-sm font-semibold text-purple-900 dark:text-purple-200">{subDependentNombre}</p>
              </div>
            ) : dependents.length > 0 && (
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
              <button onClick={() => { setConfirming(null); setConfirmOverride(null) }}
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

      {/* Modal gestionar reservas */}
      {managing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50" onClick={() => setManaging(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 w-80 space-y-4 border border-transparent dark:border-gray-700" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 dark:text-white">Reservas en esta sesión</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(managing.fecha).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })} · {managing.horaInicio}–{managing.horaFin}
            </p>
            <div className="space-y-2">
              {/* Sub actual: si no tiene reserva y hay sesiones, mostrar opción de reservar */}
              {subDependentId && managing.misReservas.length === 0 && sesionesDisponibles > 0 && managing.reservas < managing.cupoMax && (
                <div className="flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{subDependentNombre ?? 'Titular'}</span>
                  <button
                    onClick={() => { const slot = managing; setManaging(null); openConfirm(slot) }}
                    className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                  >+ Reservar</button>
                </div>
              )}
              {/* Reservas ya existentes de la sub actual */}
              {managing.misReservas.map(r => (
                <div key={r.bookingId} className="flex items-center justify-between gap-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-800 dark:text-gray-200">
                    {r.dependentNombre ?? subDependentNombre ?? 'Titular'} <span className="text-green-600">✓</span>
                  </span>
                  <button
                    onClick={() => { setManaging(null); setCancelling(r.bookingId) }}
                    className="text-xs text-red-600 hover:text-red-700 font-medium"
                  >Cancelar</button>
                </div>
              ))}
              {/* Subs hermanas — mostrar botón de reserva si aún no han reservado este slot */}
              {(siblingSubscriptions ?? [])
                .filter(ss => !ss.bookedSlotIndices.includes(managing.index) && ss.sesionesDisponibles > 0 && managing.reservas < managing.cupoMax)
                .map(ss => (
                  <div key={ss.subscriptionId} className="flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{ss.dependentNombre}</span>
                    <button
                      onClick={() => {
                        const slot = managing
                        setManaging(null)
                        setConfirmOverride({ subscriptionId: ss.subscriptionId, dependentId: ss.dependentId, dependentNombre: ss.dependentNombre })
                        setConfirming(slot)
                      }}
                      className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                    >+ Reservar</button>
                  </div>
                ))}
              {/* Sub sin dependentId: opción de reservar otra (comportamiento anterior) */}
              {!subDependentId && managing.reservas < managing.cupoMax && sesionesDisponibles > 0 && (
                <button
                  onClick={() => { const slot = managing; setManaging(null); openConfirm(slot) }}
                  className="w-full bg-purple-600 text-white py-2 rounded-lg font-medium hover:bg-purple-700"
                >
                  + Reservar otra
                </button>
              )}
            </div>
            <button onClick={() => setManaging(null)}
              className="w-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
