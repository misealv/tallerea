'use client'

interface Slot {
  dia: string
  horaInicio: string
  horaFin: string
  cupoMax: number
  cupoDisponible: number
}

interface Props {
  slots: Slot[]
  selectedSlots: number[]
  onSelectionChange: (indices: number[]) => void
}

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const
const DIA_LABEL: Record<string, string> = {
  lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue',
  viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom',
}
const DIA_LABEL_FULL: Record<string, string> = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
  viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
}

const CELL_HEIGHT = 28 // px por 30 min

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export default function SlotCalendarPicker({ slots, selectedSlots, onSelectionChange }: Props) {
  if (slots.length === 0) return null

  // Calcular rango de horas visible solo en torno a los slots existentes
  const allMins = slots.flatMap(s => [timeToMinutes(s.horaInicio), timeToMinutes(s.horaFin)])
  const minHour = Math.max(0, Math.floor(Math.min(...allMins) / 60) - 1)
  const maxHour = Math.min(23, Math.ceil(Math.max(...allMins) / 60) + 1)

  const hours: number[] = []
  for (let h = minHour; h < maxHour; h++) hours.push(h)

  // Solo días que tienen al menos un slot
  const diasConSlots = DIAS.filter(d => slots.some(s => s.dia === d))

  function toggleSlot(idx: number) {
    const slot = slots[idx]
    if (slot.cupoDisponible <= 0) return
    if (selectedSlots.includes(idx)) {
      onSelectionChange(selectedSlots.filter(i => i !== idx))
    } else {
      // Selección única: reemplazar
      onSelectionChange([idx])
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-900">Elige tu horario</h3>
      <p className="text-xs text-gray-500">Haz clic en un bloque para seleccionar el horario</p>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <div style={{ minWidth: `${50 + diasConSlots.length * 90}px` }}>
          {/* Header días */}
          <div
            className="border-b border-gray-200 bg-gray-50"
            style={{ display: 'grid', gridTemplateColumns: `50px repeat(${diasConSlots.length}, 1fr)` }}
          >
            <div className="p-1 text-xs text-gray-400" />
            {diasConSlots.map(d => (
              <div key={d} className="py-2 px-1 text-xs font-semibold text-center text-gray-700">
                <span className="hidden sm:inline">{DIA_LABEL_FULL[d]}</span>
                <span className="sm:hidden">{DIA_LABEL[d]}</span>
              </div>
            ))}
          </div>

          {/* Celdas + bloques */}
          <div className="relative">
            {hours.map(h => (
              <div
                key={h}
                style={{ display: 'grid', gridTemplateColumns: `50px repeat(${diasConSlots.length}, 1fr)` }}
              >
                {/* Hora label */}
                <div
                  className="text-xs text-gray-400 pr-2 text-right border-r border-gray-200 flex items-start justify-end pt-0.5"
                  style={{ height: CELL_HEIGHT * 2 }}
                >
                  {String(h).padStart(2, '0')}:00
                </div>
                {diasConSlots.map(d => (
                  <div
                    key={`${d}-${h}`}
                    className="border-b border-r border-gray-100 relative"
                    style={{ height: CELL_HEIGHT * 2 }}
                  >
                    {/* Divisor media hora */}
                    <div
                      className="absolute inset-x-0 border-t border-dashed border-gray-100"
                      style={{ top: CELL_HEIGHT }}
                    />
                  </div>
                ))}
              </div>
            ))}

            {/* Bloques de slots */}
            {slots.map((slot, idx) => {
              const diaIdx = diasConSlots.indexOf(slot.dia as typeof DIAS[number])
              if (diaIdx < 0) return null

              const startMin = timeToMinutes(slot.horaInicio) - minHour * 60
              const endMin = timeToMinutes(slot.horaFin) - minHour * 60
              const top = (startMin / 30) * CELL_HEIGHT
              const height = Math.max(((endMin - startMin) / 30) * CELL_HEIGHT, CELL_HEIGHT)

              const full = slot.cupoDisponible <= 0
              const selected = selectedSlots.includes(idx)
              const pct = slot.cupoMax > 0
                ? Math.round(((slot.cupoMax - slot.cupoDisponible) / slot.cupoMax) * 100)
                : 100

              const colWidth = `calc((100% - 50px) / ${diasConSlots.length})`
              const left = `calc(50px + ${diaIdx} * ${colWidth})`

              let bgClass: string
              if (selected) bgClass = 'bg-purple-600 text-white ring-2 ring-purple-400 ring-offset-1'
              else if (full) bgClass = 'bg-gray-300 text-gray-500 cursor-not-allowed'
              else bgClass = 'bg-purple-100 text-purple-900 hover:bg-purple-200 cursor-pointer'

              return (
                <div
                  key={idx}
                  className={`absolute rounded-md px-1.5 py-1 text-xs z-10 transition-all overflow-hidden select-none ${bgClass}`}
                  style={{ top, height, left, width: `calc(${colWidth} - 4px)`, marginLeft: 2 }}
                  onClick={() => toggleSlot(idx)}
                  title={full ? 'Sin cupos disponibles' : `${slot.cupoDisponible} cupo${slot.cupoDisponible !== 1 ? 's' : ''} disponible${slot.cupoDisponible !== 1 ? 's' : ''}`}
                >
                  <div className="font-semibold truncate">{slot.horaInicio}–{slot.horaFin}</div>
                  {height >= CELL_HEIGHT * 1.5 && (
                    <div className="mt-0.5 space-y-0.5">
                      {/* Barra de ocupación */}
                      {slot.cupoMax > 0 && (
                        <div className={`h-1 rounded-full ${selected ? 'bg-white/40' : 'bg-purple-300'} overflow-hidden`}>
                          <div
                            className={`h-full rounded-full ${selected ? 'bg-white' : pct > 80 ? 'bg-orange-400' : 'bg-purple-600'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                      <div className="text-[10px] opacity-90">
                        {full ? 'Lleno' : `${slot.cupoDisponible}${slot.cupoMax > 0 ? `/${slot.cupoMax}` : ''} cupo${slot.cupoDisponible !== 1 ? 's' : ''}`}
                      </div>
                    </div>
                  )}
                  {full && height < CELL_HEIGHT * 1.5 && (
                    <div className="text-[10px] mt-0.5">Lleno</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Leyenda selección */}
      {selectedSlots.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 rounded-lg px-3 py-2">
          <span className="w-3 h-3 rounded bg-purple-600 flex-shrink-0" />
          <span className="font-medium">
            {DIA_LABEL_FULL[slots[selectedSlots[0]].dia]} {slots[selectedSlots[0]].horaInicio} — {slots[selectedSlots[0]].horaFin}
          </span>
          <span className="text-purple-500 text-xs">({slots[selectedSlots[0]].cupoDisponible} cupos)</span>
        </div>
      )}
    </div>
  )
}
