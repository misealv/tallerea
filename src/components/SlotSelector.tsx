'use client'

import { useState } from 'react'

interface Slot {
  dia: string
  horaInicio: string
  horaFin: string
  cupoMax: number
  cupoDisponible: number
}

interface SlotSelectorProps {
  slots: Slot[]
  selectedSlots: number[]
  onSelectionChange: (indices: number[]) => void
  multiSelect?: boolean
}

const DIA_LABEL: Record<string, string> = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
  viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
}

export default function SlotSelector({ slots, selectedSlots, onSelectionChange, multiSelect = false }: SlotSelectorProps) {
  const [showMulti, setShowMulti] = useState(multiSelect)

  function toggleSlot(idx: number) {
    if (slots[idx].cupoDisponible <= 0) return
    if (showMulti) {
      if (selectedSlots.includes(idx)) {
        onSelectionChange(selectedSlots.filter(i => i !== idx))
      } else {
        onSelectionChange([...selectedSlots, idx])
      }
    } else {
      onSelectionChange([idx])
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-900">Elige tu horario</h3>
      <div className="space-y-2">
        {slots.map((slot, idx) => {
          const full = slot.cupoDisponible <= 0
          const selected = selectedSlots.includes(idx)
          const pct = slot.cupoMax > 0 ? ((slot.cupoMax - slot.cupoDisponible) / slot.cupoMax) * 100 : 100

          return (
            <button key={idx} type="button" onClick={() => toggleSlot(idx)} disabled={full}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition text-left ${
                full ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed'
                  : selected ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
                  : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/50'
              }`}>
              {/* Radio/checkbox indicator */}
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                selected ? 'border-purple-600 bg-purple-600' : full ? 'border-gray-300' : 'border-gray-400'
              }`}>
                {selected && <div className="w-full h-full flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-white rounded-full" />
                </div>}
              </div>

              {/* Día y hora */}
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-800">{DIA_LABEL[slot.dia] || slot.dia}</span>
                <span className="text-gray-600 ml-2">{slot.horaInicio} — {slot.horaFin}</span>
              </div>

              {/* Barra de ocupación */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${
                    full ? 'bg-red-400' : pct > 80 ? 'bg-orange-400' : 'bg-green-400'
                  }`} style={{ width: `${pct}%` }} />
                </div>
                <span className={`text-xs font-medium whitespace-nowrap ${full ? 'text-red-500' : 'text-gray-500'}`}>
                  {full ? 'Lleno' : `${slot.cupoDisponible} cupos`}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Toggle multi-slot */}
      {slots.length > 1 && !showMulti && (
        <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
          <input type="checkbox" onChange={() => setShowMulti(true)}
            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
          También quiero inscribirme en otro horario
        </label>
      )}
    </div>
  )
}
