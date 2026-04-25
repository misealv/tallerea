'use client'

import { useState, useMemo, useEffect } from 'react'
import { type SlotData } from './SlotCalendar'

export interface ScheduledSlot {
  dia: string
  horaInicio: string
  horaFin: string
  fecha: string        // 'YYYY-MM-DD'
  cupoMax: number
  cupoDisponible: number
  cancelado: boolean
  reservas?: number
}

interface Props {
  patternSlots: SlotData[]
  fechaInicio: string        // 'YYYY-MM-DD'
  semanas?: number           // default 8
  existingSlots?: ScheduledSlot[]
  onChange: (slots: ScheduledSlot[]) => void
}

// Lun → Dom (índice JS: 1-0)
const DIAS_WEEK = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
const DIAS_ORDER = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const DIA_LABEL: Record<string, string> = {
  lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue',
  viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom',
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function generateInstances(patterns: SlotData[], fechaInicio: string, semanas: number): ScheduledSlot[] {
  if (!fechaInicio || patterns.length === 0) return []
  const start = new Date(fechaInicio + 'T12:00:00')
  const instances: ScheduledSlot[] = []

  for (let week = 0; week < semanas; week++) {
    for (const pat of patterns) {
      const diaIdx = DIAS_ORDER.indexOf(pat.dia)
      if (diaIdx < 0) continue
      const weekBase = new Date(start)
      weekBase.setDate(start.getDate() + week * 7)
      const monday = getMonday(weekBase)
      const offset = diaIdx === 0 ? 6 : diaIdx - 1
      const target = addDays(monday, offset)
      const fechaStr = toDateStr(target)
      if (fechaStr < fechaInicio) continue
      instances.push({
        dia: pat.dia, horaInicio: pat.horaInicio, horaFin: pat.horaFin,
        fecha: fechaStr, cupoMax: pat.cupoMax, cupoDisponible: pat.cupoDisponible,
        cancelado: false, reservas: 0,
      })
    }
  }
  instances.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.horaInicio.localeCompare(b.horaInicio))
  return instances
}

function mergeWithExisting(generated: ScheduledSlot[], existing: ScheduledSlot[]): ScheduledSlot[] {
  return generated.map(gen => {
    const found = existing.find(e => e.fecha === gen.fecha && e.horaInicio === gen.horaInicio)
    return found
      ? { ...gen, cancelado: found.cancelado, reservas: found.reservas ?? 0,
          cupoMax: found.cupoMax ?? gen.cupoMax, cupoDisponible: found.cupoDisponible ?? gen.cupoDisponible }
      : gen
  })
}

export default function SlotScheduleManager({ patternSlots, fechaInicio, semanas = 8, existingSlots, onChange }: Props) {
  const [instances, setInstances] = useState<ScheduledSlot[]>(() => {
    const generated = generateInstances(patternSlots, fechaInicio, semanas)
    return existingSlots?.length ? mergeWithExisting(generated, existingSlots) : generated
  })
  const [weekOffset, setWeekOffset] = useState(0)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  useEffect(() => {
    const generated = generateInstances(patternSlots, fechaInicio, semanas)
    const merged = mergeWithExisting(generated, instances)
    setInstances(merged)
    onChange(merged)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternSlots, fechaInicio, semanas])

  function toggleCancel(idx: number) {
    const updated = instances.map((s, i) => i === idx ? { ...s, cancelado: !s.cancelado } : s)
    setInstances(updated)
    onChange(updated)
  }

  function updateCupo(idx: number, cupo: number) {
    const updated = instances.map((s, i) =>
      i === idx ? { ...s, cupoMax: cupo, cupoDisponible: Math.min(s.cupoDisponible, cupo) } : s
    )
    setInstances(updated)
    onChange(updated)
  }

  // Semanas únicas disponibles
  const allWeekMondays = useMemo(() => {
    const seen = new Set<string>()
    instances.forEach(s => seen.add(toDateStr(getMonday(new Date(s.fecha + 'T12:00:00')))))
    return Array.from(seen).sort()
  }, [instances])

  const currentMonday = useMemo(() => {
    return allWeekMondays[weekOffset]
      ? new Date(allWeekMondays[weekOffset] + 'T12:00:00')
      : (fechaInicio ? getMonday(new Date(fechaInicio + 'T12:00:00')) : getMonday(new Date()))
  }, [allWeekMondays, weekOffset, fechaInicio])

  // Días de la semana actual (Lun-Dom)
  const weekDays = DIAS_WEEK.map((dia, i) => ({
    dia,
    date: addDays(currentMonday, i),
    dateStr: toDateStr(addDays(currentMonday, i)),
  }))

  // Slots de la semana actual indexados por (fecha, horaInicio)
  const weekSlots = useMemo(() => {
    const map: Record<string, ScheduledSlot & { idx: number }> = {}
    instances.forEach((s, idx) => {
      if (s.fecha >= toDateStr(currentMonday) && s.fecha <= toDateStr(addDays(currentMonday, 6))) {
        map[`${s.fecha}|${s.horaInicio}`] = { ...s, idx }
      }
    })
    return map
  }, [instances, currentMonday])

  // Horas únicas que aparecen en la semana
  const horasUnicas = useMemo(() => {
    const seen = new Set<string>()
    Object.values(weekSlots).forEach(s => seen.add(s.horaInicio))
    patternSlots.forEach(p => seen.add(p.horaInicio))
    return Array.from(seen).sort()
  }, [weekSlots, patternSlots])

  const weekLabel = currentMonday.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
  const weekEnd = addDays(currentMonday, 6).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })

  if (!fechaInicio || patternSlots.length === 0) {
    return (
      <div className="text-sm text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-lg">
        Define el horario semanal y la fecha de inicio para ver las sesiones generadas
      </div>
    )
  }

  const activas = instances.filter(s => !s.cancelado).length
  const canceladas = instances.filter(s => s.cancelado).length
  const today = toDateStr(new Date())

  return (
    <div className="space-y-3" onClick={() => setEditingIdx(null)}>
      {/* Resumen + navegación */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{activas} activa{activas !== 1 ? 's' : ''}</span>
          {canceladas > 0 && <span className="text-red-500">{canceladas} cancelada{canceladas !== 1 ? 's' : ''}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setWeekOffset(w => Math.max(0, w - 1))}
            disabled={weekOffset === 0}
            className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30">
            ‹
          </button>
          <span className="text-xs text-gray-600 font-medium whitespace-nowrap">
            {weekLabel} — {weekEnd}
          </span>
          <button type="button" onClick={() => setWeekOffset(w => Math.min(allWeekMondays.length - 1, w + 1))}
            disabled={weekOffset >= allWeekMondays.length - 1}
            className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30">
            ›
          </button>
        </div>
      </div>

      {/* Cuadrícula semanal */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm border-collapse min-w-[500px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="py-2 px-3 text-xs text-gray-400 font-normal text-left w-16">Hora</th>
              {weekDays.map(({ dia, date, dateStr }) => {
                const isToday = dateStr === today
                const hasSessions = Object.keys(weekSlots).some(k => k.startsWith(dateStr + '|'))
                return (
                  <th key={dia} className="py-2 px-1 text-center">
                    <div className={`text-xs font-semibold ${hasSessions ? 'text-purple-700' : 'text-gray-400'}`}>
                      {DIA_LABEL[dia]}
                    </div>
                    <div className={`text-xs mt-0.5 ${isToday ? 'bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center mx-auto' : 'text-gray-400'}`}>
                      {date.getDate()}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {horasUnicas.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-xs text-gray-400">
                  Sin sesiones esta semana
                </td>
              </tr>
            ) : horasUnicas.map(hora => (
              <tr key={hora} className="border-b border-gray-100 last:border-0">
                <td className="py-2 px-3 text-xs text-gray-400 font-mono">{hora}</td>
                {weekDays.map(({ dateStr }) => {
                  const key = `${dateStr}|${hora}`
                  const slot = weekSlots[key]
                  if (!slot) return <td key={dateStr} className="py-1 px-1" />
                  const isPast = slot.fecha < today

                  return (
                    <td key={dateStr} className="py-1 px-1">
                      <div
                        className={`relative rounded-lg px-2 py-2 text-center text-xs transition cursor-pointer select-none
                          ${slot.cancelado
                            ? 'bg-red-50 border border-red-200 text-red-400'
                            : isPast
                            ? 'bg-gray-50 border border-gray-200 text-gray-400'
                            : 'bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100'
                          }`}
                        onClick={e => { e.stopPropagation(); setEditingIdx(editingIdx === slot.idx ? null : slot.idx) }}
                      >
                        <div className={`font-medium text-xs ${slot.cancelado ? 'line-through' : ''}`}>
                          {slot.horaInicio}
                        </div>
                        <div className={`text-xs mt-0.5 ${slot.cancelado ? 'line-through opacity-60' : 'opacity-70'}`}>
                          {slot.horaFin}
                        </div>
                        {slot.cancelado ? (
                          <div className="text-xs mt-1 font-medium text-red-500">Cancelada</div>
                        ) : (
                          <div className="text-xs mt-1 opacity-60">{slot.cupoMax} cupos</div>
                        )}
                        {(slot.reservas ?? 0) > 0 && (
                          <div className="text-xs text-amber-600 font-medium">{slot.reservas} res.</div>
                        )}

                        {/* Popover de acciones */}
                        {editingIdx === slot.idx && (
                          <div className="absolute z-30 top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-44 text-left" onClick={e => e.stopPropagation()}>
                            {!slot.cancelado && (
                              <>
                                <p className="text-xs font-medium text-gray-700 mb-1.5">Cupo máximo</p>
                                <input
                                  type="number" min="1" defaultValue={slot.cupoMax}
                                  onBlur={e => updateCupo(slot.idx, Math.max(1, Number(e.target.value) || 1))}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 mb-2"
                                  onClick={e => e.stopPropagation()}
                                />
                              </>
                            )}
                            <button type="button"
                              onClick={() => { toggleCancel(slot.idx); setEditingIdx(null) }}
                              className={`w-full text-xs py-1.5 rounded-lg font-medium transition ${
                                slot.cancelado
                                  ? 'bg-green-50 text-green-700 hover:bg-green-100'
                                  : 'bg-red-50 text-red-600 hover:bg-red-100'
                              }`}>
                              {slot.cancelado ? '✓ Restaurar sesión' : '✕ Cancelar sesión'}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
