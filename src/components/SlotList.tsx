'use client'

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

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export default function SlotList({ slots, duracionSesion, cupoDefault, onSlotsChange }: SlotListProps) {

  function addSlot() {
    const lastSlot = slots[slots.length - 1]
    const dia = lastSlot ? DIAS[(DIAS.indexOf(lastSlot.dia as typeof DIAS[number]) + 1) % 7] : 'lunes'
    const horaInicio = lastSlot?.horaInicio || '10:00'
    const horaFin = addMinutes(horaInicio, duracionSesion)
    onSlotsChange([...slots, { dia, horaInicio, horaFin, cupoMax: cupoDefault, cupoDisponible: cupoDefault }])
  }

  function duplicateLast() {
    if (slots.length === 0) return
    const last = slots[slots.length - 1]
    const nextDia = DIAS[(DIAS.indexOf(last.dia as typeof DIAS[number]) + 1) % 7]
    onSlotsChange([...slots, { ...last, dia: nextDia }])
  }

  function updateSlot(idx: number, field: keyof SlotData, value: string | number) {
    const updated = [...slots]
    updated[idx] = { ...updated[idx], [field]: value }
    // Si cambia horaInicio, recalcular horaFin con duracionSesion
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
  }

  return (
    <div className="space-y-3">
      {slots.map((slot, idx) => (
        <div key={idx} className="flex flex-wrap items-center gap-2 bg-gray-50 rounded-lg p-3">
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
          <button type="button" onClick={() => removeSlot(idx)} className="text-red-400 hover:text-red-600 ml-auto">✕</button>
        </div>
      ))}

      <div className="flex gap-2">
        <button type="button" onClick={addSlot}
          className="text-sm text-purple-600 hover:text-purple-800 font-medium">
          + Agregar bloque
        </button>
        {slots.length > 0 && (
          <button type="button" onClick={duplicateLast}
            className="text-sm text-gray-500 hover:text-gray-700">
            Duplicar último
          </button>
        )}
      </div>
    </div>
  )
}
