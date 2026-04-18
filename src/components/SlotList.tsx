'use client'

import { useState } from 'react'
import { type SlotData } from './SlotCalendar'

interface SlotListProps {
  slots: SlotData[]
  duracionSesion: number
  cupoDefault: number
  onSlotsChange: (slots: SlotData[]) => void
}

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const
const DIA_LABEL: Record<string, string> = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
  viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
}
const DIA_SHORT: Record<string, string> = {
  lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue',
  viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom',
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export default function SlotList({ slots, duracionSesion, cupoDefault, onSlotsChange }: SlotListProps) {
  const [repeatIdx, setRepeatIdx] = useState<number | null>(null)
  const [repeatDias, setRepeatDias] = useState<string[]>([])

  function addSlot() {
    const lastSlot = slots[slots.length - 1]
    const dia = lastSlot ? DIAS[(DIAS.indexOf(lastSlot.dia as typeof DIAS[number]) + 1) % 7] : 'lunes'
    const horaInicio = lastSlot?.horaInicio || '10:00'
    const horaFin = addMinutes(horaInicio, duracionSesion)
    onSlotsChange([...slots, { dia, horaInicio, horaFin, cupoMax: cupoDefault, cupoDisponible: cupoDefault }])
  }

  function updateSlot(idx: number, field: keyof SlotData, value: string | number) {
    const updated = [...slots]
    updated[idx] = { ...updated[idx], [field]: value }
    if (field === 'horaInicio') {
      updated[idx].horaFin = addMinutes(String(value), duracionSesion)
    }
    if (field === 'cupoMax') {
      updated[idx].cupoDisponible = Number(value)
    }
    onSlotsChange(updated)
  }

  function removeSlot(idx: number) {
    onSlotsChange(slots.filter((_, i) => i !== idx))
    if (repeatIdx === idx) setRepeatIdx(null)
  }

  function openRepeat(idx: number) {
    setRepeatIdx(idx)
    setRepeatDias([])
  }

  function confirmRepeat() {
    if (repeatIdx === null || repeatDias.length === 0) return
    const source = slots[repeatIdx]
    const newSlots = repeatDias
      .filter(d => !slots.some(s => s.dia === d && s.horaInicio === source.horaInicio))
      .map(d => ({ ...source, dia: d, cupoDisponible: source.cupoMax }))
    onSlotsChange([...slots, ...newSlots])
    setRepeatIdx(null)
    setRepeatDias([])
  }

  return (
    <div className="space-y-3">
      {slots.map((slot, idx) => (
        <div key={idx} className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select value={slot.dia} onChange={e => updateSlot(idx, 'dia', e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500">
              {DIAS.map(d => <option key={d} value={d}>{DIA_LABEL[d]}</option>)}
            </select>
            <input type="time" value={slot.horaInicio}
              onChange={e => updateSlot(idx, 'horaInicio', e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" />
            <span className="text-gray-400 text-sm">→</span>
            <span className="text-sm text-gray-600">{slot.horaFin}</span>
            <input type="number" min="1" value={slot.cupoMax}
              onChange={e => updateSlot(idx, 'cupoMax', Number(e.target.value))}
              className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" />
            <span className="text-xs text-gray-400">cupos</span>
            <div className="ml-auto flex gap-1">
              <button type="button" onClick={() => openRepeat(idx)}
                title="Repetir en otros días"
                className="text-purple-500 hover:text-purple-700 text-xs px-2 py-1 rounded hover:bg-purple-50 transition">
                🔁 Repetir
              </button>
              <button type="button" onClick={() => removeSlot(idx)}
                className="text-red-400 hover:text-red-600 px-1">✕</button>
            </div>
          </div>

          {/* Panel de repetición para este slot */}
          {repeatIdx === idx && (
            <div className="bg-purple-50 rounded-lg p-3 space-y-2 border border-purple-200">
              <p className="text-xs text-purple-700 font-medium">Repetir este horario en otros días:</p>
              <div className="flex flex-wrap gap-1.5">
                {DIAS.filter(d => d !== slot.dia).map(d => {
                  const exists = slots.some(s => s.dia === d && s.horaInicio === slot.horaInicio)
                  const selected = repeatDias.includes(d)
                  return (
                    <button key={d} type="button" disabled={exists}
                      onClick={() => {
                        if (selected) setRepeatDias(prev => prev.filter(x => x !== d))
                        else setRepeatDias(prev => [...prev, d])
                      }}
                      className={`px-2.5 py-1 text-xs rounded-md border transition ${
                        exists ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : selected ? 'bg-purple-200 text-purple-800 border-purple-400 font-medium'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                      }`}>
                      {DIA_SHORT[d]}
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={confirmRepeat} disabled={repeatDias.length === 0}
                  className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition font-medium">
                  Crear en {repeatDias.length} día{repeatDias.length !== 1 ? 's' : ''}
                </button>
                <button type="button" onClick={() => setRepeatIdx(null)}
                  className="text-xs text-gray-500 px-3 py-1.5 hover:text-gray-700">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex gap-2">
        <button type="button" onClick={addSlot}
          className="text-sm text-purple-600 hover:text-purple-800 font-medium">
          + Agregar bloque
        </button>
      </div>
    </div>
  )
}
