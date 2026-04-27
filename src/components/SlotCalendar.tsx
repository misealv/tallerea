'use client'

import { useState, useRef, useCallback } from 'react'

export interface SlotData {
  dia: string
  horaInicio: string
  horaFin: string
  cupoMax: number
  cupoDisponible: number
}

interface SlotCalendarProps {
  slots: SlotData[]
  duracionSesion: number
  cupoDefault: number
  onSlotsChange: (slots: SlotData[]) => void
}

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const
const DIA_LABEL: Record<string, string> = {
  lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue',
  viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom',
}

// Normaliza 'miércoles' / 'Sábado' → 'miercoles' / 'sabado' (sin acentos, minúscula)
function normalizeDia(dia: string): string {
  return dia.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

const START_HOUR = 7
const END_HOUR = 22
const CELL_HEIGHT = 28 // px por 30 min

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function addMinutes(time: string, mins: number): string {
  return minutesToTime(timeToMinutes(time) + mins)
}

export default function SlotCalendar({ slots, duracionSesion, cupoDefault, onSlotsChange }: SlotCalendarProps) {
  const [popover, setPopover] = useState<{ dia: string; hora: string; slotIdx?: number } | null>(null)
  const [popoverCupo, setPopoverCupo] = useState(String(cupoDefault))
  const [popoverRepeatDias, setPopoverRepeatDias] = useState<string[]>([])
  const [showRepeatInEdit, setShowRepeatInEdit] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  const handleCellClick = useCallback((dia: string, hour: number, half: number) => {
    const minuteOfDay = hour * 60 + half * 30
    // Verificar si ya hay un slot aquí (comparar normalizando día)
    const existingIdx = slots.findIndex(s =>
      normalizeDia(s.dia) === dia && timeToMinutes(s.horaInicio) <= minuteOfDay && timeToMinutes(s.horaFin) > minuteOfDay
    )
    if (existingIdx >= 0) {
      setPopover({ dia, hora: slots[existingIdx].horaInicio, slotIdx: existingIdx })
      setPopoverCupo(String(slots[existingIdx].cupoMax))
      return
    }
    const horaInicio = minutesToTime(minuteOfDay)
    setPopover({ dia, hora: horaInicio })
    setPopoverCupo(String(cupoDefault))
    setPopoverRepeatDias([])
  }, [slots, cupoDefault])

  const handleCreate = () => {
    if (!popover || popover.slotIdx !== undefined) return
    const horaFin = addMinutes(popover.hora, duracionSesion)
    const cupo = Math.max(1, Number(popoverCupo) || cupoDefault)
    const diasToCreate = [popover.dia, ...popoverRepeatDias.filter(d => d !== popover.dia)]
    const newSlots = diasToCreate
      .filter(d => !slots.some(s => s.dia === d && s.horaInicio === popover.hora))
      .map(d => ({ dia: d, horaInicio: popover.hora, horaFin, cupoMax: cupo, cupoDisponible: cupo }))
    onSlotsChange([...slots, ...newSlots])
    setPopover(null)
    setPopoverRepeatDias([])
  }

  const handleRemove = (idx: number) => {
    onSlotsChange(slots.filter((_, i) => i !== idx))
    setPopover(null)
  }

  const handleRepeatExisting = () => {
    if (!popover || popover.slotIdx === undefined || popoverRepeatDias.length === 0) return
    const source = slots[popover.slotIdx]
    const newSlots = popoverRepeatDias
      .filter(d => !slots.some(s => s.dia === d && s.horaInicio === source.horaInicio))
      .map(d => ({ ...source, dia: d, cupoDisponible: source.cupoMax }))
    onSlotsChange([...slots, ...newSlots])
    setPopover(null)
    setShowRepeatInEdit(false)
    setPopoverRepeatDias([])
  }

  // Generar filas de horas
  const hours: number[] = []
  for (let h = START_HOUR; h < END_HOUR; h++) hours.push(h)

  return (
    <div className="space-y-3">
      {/* Grilla semanal */}
      <div ref={gridRef} className="overflow-x-auto border border-gray-200 rounded-lg">
        <div className="min-w-[600px]">
          {/* Header días */}
          <div className="grid grid-cols-[50px_repeat(7,1fr)] border-b border-gray-200 bg-gray-50">
            <div className="p-1 text-xs text-gray-400" />
            {DIAS.map(d => (
              <div key={d} className="p-1 text-xs font-medium text-center text-gray-700">{DIA_LABEL[d]}</div>
            ))}
          </div>
          {/* Celdas */}
          <div className="relative">
            {hours.map(h => (
              <div key={h} className="grid grid-cols-[50px_repeat(7,1fr)]">
                {/* Hora label */}
                <div className="text-xs text-gray-400 pr-1 text-right py-0.5 border-r border-gray-300"
                  style={{ height: CELL_HEIGHT * 2 }}>
                  {String(h).padStart(2, '0')}:00
                </div>
                {DIAS.map(d => (
                  <div key={`${d}-${h}`} className="border-b border-r border-gray-200 relative"
                    style={{ height: CELL_HEIGHT * 2 }}>
                    {/* Top half (00) */}
                    <div
                      className="absolute inset-x-0 top-0 cursor-pointer hover:bg-purple-50 transition-colors"
                      style={{ height: CELL_HEIGHT }}
                      onClick={() => handleCellClick(d, h, 0)}
                    />
                    {/* Bottom half (30) */}
                    <div
                      className="absolute inset-x-0 bottom-0 cursor-pointer hover:bg-purple-50 transition-colors border-t border-dashed border-gray-300"
                      style={{ height: CELL_HEIGHT }}
                      onClick={() => handleCellClick(d, h, 1)}
                    />
                  </div>
                ))}
              </div>
            ))}

            {/* Bloques de slots renderizados encima de la grilla */}
            {slots.map((slot, idx) => {
              const diaIdx = DIAS.indexOf(normalizeDia(slot.dia) as typeof DIAS[number])
              if (diaIdx < 0) return null
              const startMin = timeToMinutes(slot.horaInicio) - START_HOUR * 60
              const endMin = timeToMinutes(slot.horaFin) - START_HOUR * 60
              const top = (startMin / 30) * CELL_HEIGHT
              const height = ((endMin - startMin) / 30) * CELL_HEIGHT
              // Calcular left: 50px para columna hora + (diaIdx / 7) del ancho restante
              const colWidth = `calc((100% - 50px) / 7)`
              const left = `calc(50px + ${diaIdx} * ${colWidth})`

              return (
                <div
                  key={idx}
                  className="absolute bg-purple-600 text-white rounded px-1 text-xs cursor-pointer hover:bg-purple-700 transition-colors overflow-hidden z-10"
                  style={{ top, height: Math.max(height, CELL_HEIGHT), left, width: colWidth }}
                  onClick={() => {
                    setPopover({ dia: slot.dia, hora: slot.horaInicio, slotIdx: idx })
                    setPopoverCupo(String(slot.cupoMax))
                  }}
                >
                  <div className="font-medium truncate">{slot.horaInicio}</div>
                  {height > CELL_HEIGHT && <div className="opacity-80">{slot.cupoMax} cupos</div>}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Popover crear/editar */}
      {popover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setPopover(null)}>
          <div className="bg-white rounded-xl border shadow-lg p-5 w-72 space-y-3" onClick={e => e.stopPropagation()}>
            {popover.slotIdx !== undefined ? (
              <>
                <h3 className="font-semibold text-gray-900">
                  {DIA_LABEL[popover.dia]} {slots[popover.slotIdx].horaInicio} — {slots[popover.slotIdx].horaFin}
                </h3>

                {/* Editar cupo */}
                <div>
                  <label className="text-xs text-gray-500">Cupo máximo</label>
                  <input
                    type="number" min="1" value={popoverCupo}
                    onChange={e => setPopoverCupo(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const cupo = Math.max(1, Number(popoverCupo) || 1)
                    const updated = slots.map((s, i) =>
                      i === popover.slotIdx ? { ...s, cupoMax: cupo, cupoDisponible: cupo } : s
                    )
                    onSlotsChange(updated)
                    setPopover(null)
                  }}
                  className="w-full bg-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-purple-700">
                  Guardar cambios
                </button>

                {/* Repetir en otros días */}
                {!showRepeatInEdit ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setShowRepeatInEdit(true); setPopoverRepeatDias([]) }}
                      className="flex-1 text-sm bg-purple-50 text-purple-700 py-2 rounded-lg hover:bg-purple-100">
                      🔁 Repetir
                    </button>
                    <button type="button" onClick={() => handleRemove(popover.slotIdx!)}
                      className="flex-1 text-sm bg-red-50 text-red-600 py-2 rounded-lg hover:bg-red-100">
                      Eliminar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs text-gray-500 block">Repetir en otros días:</label>
                    <div className="flex flex-wrap gap-1.5">
                      {DIAS.filter(d => d !== popover.dia).map(d => {
                        const exists = slots.some(s => s.dia === d && s.horaInicio === slots[popover.slotIdx!].horaInicio)
                        const selected = popoverRepeatDias.includes(d)
                        return (
                          <button key={d} type="button" disabled={exists}
                            onClick={() => {
                              if (selected) setPopoverRepeatDias(prev => prev.filter(x => x !== d))
                              else setPopoverRepeatDias(prev => [...prev, d])
                            }}
                            className={`px-2 py-1 text-xs rounded-md border transition ${
                              exists ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                              : selected ? 'bg-purple-100 text-purple-700 border-purple-300 font-medium'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                            }`}>
                            {DIA_LABEL[d]}
                          </button>
                        )
                      })}
                    </div>
                    {popoverRepeatDias.length > 0 && (
                      <p className="text-xs text-purple-600">Se creará en {popoverRepeatDias.length} día{popoverRepeatDias.length !== 1 ? 's' : ''} más</p>
                    )}
                    <div className="flex gap-2">
                      <button type="button" onClick={handleRepeatExisting} disabled={popoverRepeatDias.length === 0}
                        className="flex-1 bg-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                        Crear ({popoverRepeatDias.length})
                      </button>
                      <button type="button" onClick={() => setShowRepeatInEdit(false)}
                        className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-200">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <h3 className="font-semibold text-gray-900">Nuevo bloque</h3>
                <p className="text-sm text-gray-600">
                  {DIA_LABEL[popover.dia]} · {popover.hora} → {addMinutes(popover.hora, duracionSesion)} ({duracionSesion} min)
                </p>
                <div>
                  <label className="text-xs text-gray-500">Cupo máximo</label>
                  <input type="number" min="1" value={popoverCupo}
                    onChange={e => setPopoverCupo(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                </div>
                {/* Repetir semanalmente */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Repetir en otros días</label>
                  <div className="flex flex-wrap gap-1.5">
                    {DIAS.filter(d => d !== popover.dia).map(d => {
                      const exists = slots.some(s => s.dia === d && s.horaInicio === popover.hora)
                      const selected = popoverRepeatDias.includes(d)
                      return (
                        <button key={d} type="button" disabled={exists}
                          onClick={() => {
                            if (selected) setPopoverRepeatDias(prev => prev.filter(x => x !== d))
                            else setPopoverRepeatDias(prev => [...prev, d])
                          }}
                          className={`px-2 py-1 text-xs rounded-md border transition ${
                            exists ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                            : selected ? 'bg-purple-100 text-purple-700 border-purple-300 font-medium'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                          }`}>
                          {DIA_LABEL[d]}
                        </button>
                      )
                    })}
                  </div>
                  {popoverRepeatDias.length > 0 && (
                    <p className="text-xs text-purple-600 mt-1">
                      Se creará en {popoverRepeatDias.length + 1} días
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={handleCreate}
                    className="flex-1 bg-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-purple-700">
                    {popoverRepeatDias.length > 0 ? `Crear (${popoverRepeatDias.length + 1})` : 'Crear'}
                  </button>
                  <button type="button" onClick={() => { setPopover(null); setPopoverRepeatDias([]) }}
                    className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-200">
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Hint */}
      <p className="text-xs text-gray-400">
        💡 Haz clic en un espacio vacío para agregar un bloque · Clic en un bloque para repetir o eliminar
      </p>
    </div>
  )
}
