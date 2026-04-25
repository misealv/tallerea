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

const DIAS_ORDER = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const DIA_LABEL: Record<string, string> = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
  viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
}

function generateInstances(patterns: SlotData[], fechaInicio: string, semanas: number): ScheduledSlot[] {
  if (!fechaInicio || patterns.length === 0) return []
  const start = new Date(fechaInicio + 'T12:00:00')
  const instances: ScheduledSlot[] = []

  for (let week = 0; week < semanas; week++) {
    for (const pat of patterns) {
      const diaIdx = DIAS_ORDER.indexOf(pat.dia)
      if (diaIdx < 0) continue

      // Calcular fecha de inicio de la semana actual (lunes)
      const weekBase = new Date(start)
      weekBase.setDate(start.getDate() + week * 7)
      const dow = weekBase.getDay() // 0=dom, 1=lun...
      const toMonday = dow === 0 ? -6 : 1 - dow
      const monday = new Date(weekBase)
      monday.setDate(weekBase.getDate() + toMonday)

      // Offset desde lunes: lunes=0, martes=1... domingo=6
      const offset = diaIdx === 0 ? 6 : diaIdx - 1
      const target = new Date(monday)
      target.setDate(monday.getDate() + offset)

      const fechaStr = target.toISOString().split('T')[0]
      if (fechaStr < fechaInicio) continue

      instances.push({
        dia: pat.dia,
        horaInicio: pat.horaInicio,
        horaFin: pat.horaFin,
        fecha: fechaStr,
        cupoMax: pat.cupoMax,
        cupoDisponible: pat.cupoDisponible,
        cancelado: false,
        reservas: 0,
      })
    }
  }

  instances.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.horaInicio.localeCompare(b.horaInicio))
  return instances
}

function mergeWithExisting(generated: ScheduledSlot[], existing: ScheduledSlot[]): ScheduledSlot[] {
  return generated.map(gen => {
    const found = existing.find(e => e.fecha === gen.fecha && e.horaInicio === gen.horaInicio)
    return found ? { ...gen, cancelado: found.cancelado, reservas: found.reservas ?? 0,
      cupoMax: found.cupoMax ?? gen.cupoMax, cupoDisponible: found.cupoDisponible ?? gen.cupoDisponible } : gen
  })
}

export default function SlotScheduleManager({ patternSlots, fechaInicio, semanas = 8, existingSlots, onChange }: Props) {
  const [instances, setInstances] = useState<ScheduledSlot[]>(() => {
    const generated = generateInstances(patternSlots, fechaInicio, semanas)
    return existingSlots?.length ? mergeWithExisting(generated, existingSlots) : generated
  })

  // Re-generar cuando cambia el patrón, preservando cancelaciones
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

  const weeks = useMemo(() => {
    const groups: { weekKey: string; weekLabel: string; slots: (ScheduledSlot & { idx: number })[] }[] = []
    for (let i = 0; i < instances.length; i++) {
      const s = instances[i]
      const d = new Date(s.fecha + 'T12:00:00')
      const dow = d.getDay()
      const monday = new Date(d)
      monday.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
      const weekKey = monday.toISOString().split('T')[0]
      const weekLabel = `Semana del ${monday.getDate()} de ${monday.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}`
      const last = groups[groups.length - 1]
      if (!last || last.weekKey !== weekKey) groups.push({ weekKey, weekLabel, slots: [] })
      groups[groups.length - 1].slots.push({ ...s, idx: i })
    }
    return groups
  }, [instances])

  if (!fechaInicio || patternSlots.length === 0) {
    return (
      <div className="text-sm text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-lg">
        Define el horario semanal y la fecha de inicio para ver las sesiones generadas
      </div>
    )
  }

  const activas = instances.filter(s => !s.cancelado).length
  const canceladas = instances.filter(s => s.cancelado).length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>{activas} sesión{activas !== 1 ? 'es' : ''} activa{activas !== 1 ? 's' : ''}</span>
        {canceladas > 0 && <span className="text-red-500">{canceladas} cancelada{canceladas !== 1 ? 's' : ''}</span>}
      </div>

      {weeks.map(week => (
        <div key={week.weekKey} className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 border-b border-gray-200">
            {week.weekLabel}
          </div>
          <div className="divide-y divide-gray-100">
            {week.slots.map(({ idx, ...slot }) => (
              <div key={idx} className={`flex items-center gap-3 px-4 py-3 transition ${slot.cancelado ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                <div className="w-20 shrink-0">
                  <div className={`text-xs font-medium ${slot.cancelado ? 'text-red-400 line-through' : 'text-gray-700'}`}>
                    {DIA_LABEL[slot.dia] ?? slot.dia}
                  </div>
                  <div className={`text-xs ${slot.cancelado ? 'text-red-400 line-through' : 'text-gray-500'}`}>
                    {new Date(slot.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${slot.cancelado ? 'text-red-400 line-through' : 'text-gray-900'}`}>
                    {slot.horaInicio} – {slot.horaFin}
                  </div>
                  {(slot.reservas ?? 0) > 0 && (
                    <div className="text-xs text-amber-600">{slot.reservas} reserva{slot.reservas !== 1 ? 's' : ''}</div>
                  )}
                  {slot.cancelado && (
                    <div className="text-xs text-red-500 font-medium">Sesión cancelada</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number" min="1" value={slot.cupoMax}
                    disabled={slot.cancelado}
                    onChange={e => updateCupo(idx, Math.max(1, Number(e.target.value) || 1))}
                    className="w-14 px-2 py-1 text-xs border border-gray-200 rounded text-center disabled:opacity-40 focus:ring-1 focus:ring-purple-400"
                    title="Cupo máximo"
                  />
                  <span className="text-xs text-gray-400 hidden sm:inline">cupos</span>
                  <button
                    type="button"
                    onClick={() => toggleCancel(idx)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                      slot.cancelado
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'bg-red-50 text-red-600 hover:bg-red-100'
                    }`}
                  >
                    {slot.cancelado ? 'Restaurar' : 'Cancelar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
