'use client'

import { useMemo } from 'react'

interface Slot {
  dia: string
  horaInicio: string
  horaFin: string
  cupoMax?: number
  cupoDisponible?: number
  reservas?: number
}

interface Props {
  slots: Slot[]
  fechaInicio: string
  selectedSlotIndex: number | null
  selectedFecha: string | null
  onSelect: (slotIndex: number, fecha: string) => void
  cupoPorSesion?: number  // cupo global del workshop (recurrente)
}

const DIA_JS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
}
const DIA_LABEL: Record<string, string> = {
  lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue',
  viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom',
}
const MES_LABEL_FULL = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function toLocal(s: string): Date {
  // Parsear como fecha local evitando offset UTC
  const d = new Date(s.includes('T') ? s : s + 'T12:00:00')
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function nextWeekday(from: Date, targetDay: number): Date {
  const d = new Date(from)
  const diff = (targetDay - d.getDay() + 7) % 7
  d.setDate(d.getDate() + diff)
  return d
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}


interface Ocurrencia {
  slotIndex: number
  slot: Slot
  fecha: Date
  fechaISO: string
}

function generarOcurrencias(slots: Slot[], fechaInicio: string, semanas = 8): Ocurrencia[] {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const inicio = toLocal(fechaInicio)
  const desde = inicio > hoy ? inicio : hoy
  const result: Ocurrencia[] = []

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    const targetDay = DIA_JS[slot.dia]
    if (targetDay === undefined) continue
    const primera = nextWeekday(new Date(desde), targetDay)
    for (let w = 0; w < semanas; w++) {
      const fecha = new Date(primera)
      fecha.setDate(primera.getDate() + w * 7)
      result.push({ slotIndex: i, slot, fecha, fechaISO: toISODate(fecha) })
    }
  }
  return result.sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
}

export default function SlotCalendarPicker({ slots, fechaInicio, selectedSlotIndex, selectedFecha, onSelect, cupoPorSesion }: Props) {
  const ocurrencias = useMemo(() => generarOcurrencias(slots, fechaInicio, 12), [slots, fechaInicio])

  // Agrupar por mes para mostrar como secciones
  const mesesMap = useMemo(() => {
    const map = new Map<string, Ocurrencia[]>()
    for (const o of ocurrencias) {
      const key = `${o.fecha.getFullYear()}-${String(o.fecha.getMonth() + 1).padStart(2, '0')}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(o)
    }
    return map
  }, [ocurrencias])

  const meses = useMemo(() => Array.from(mesesMap.keys()).sort(), [mesesMap])

  if (!ocurrencias.length) return null

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900 text-base">Elige tu fecha</h3>

      <div className="space-y-5 max-h-[480px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-purple-200">
        {meses.map(mesKey => {
          const ocurrMes = mesesMap.get(mesKey) ?? []
          const [anio, mesNum] = mesKey.split('-')
          const mesLabel = MES_LABEL_FULL[parseInt(mesNum) - 1]

          return (
            <div key={mesKey}>
              {/* Header de mes */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-bold text-gray-700 capitalize">
                  {mesLabel} {anio}
                </span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Grid de tarjetas */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {ocurrMes.map(o => {
                  const cupoMax = o.slot.cupoMax ?? cupoPorSesion ?? 0
                  const cupoDisp = o.slot.cupoDisponible !== undefined
                    ? o.slot.cupoDisponible
                    : cupoMax > 0
                      ? Math.max(0, cupoMax - (o.slot.reservas ?? 0))
                      : 0
                  const full = cupoMax > 0 ? cupoDisp <= 0 : false
                  const selected = selectedSlotIndex === o.slotIndex && selectedFecha === o.fechaISO
                  const pct = cupoMax > 0 ? Math.round(((cupoMax - cupoDisp) / cupoMax) * 100) : 0
                  const casi = !full && cupoMax > 0 && pct >= 75

                  return (
                    <button
                      key={`${o.slotIndex}-${o.fechaISO}`}
                      type="button"
                      disabled={full}
                      onClick={() => onSelect(o.slotIndex, o.fechaISO)}
                      className={`relative rounded-xl border-2 px-3 py-3 text-left transition-all ${
                        selected
                          ? 'bg-purple-600 border-purple-600 text-white shadow-md ring-2 ring-purple-300 ring-offset-1'
                          : full
                          ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                          : 'bg-white border-purple-100 hover:border-purple-400 hover:bg-purple-50 cursor-pointer'
                      }`}
                    >
                      {/* Día de la semana */}
                      <div className={`text-xs font-medium uppercase tracking-wide mb-0.5 ${
                        selected ? 'text-purple-200' : full ? 'text-gray-400' : 'text-purple-500'
                      }`}>
                        {DIA_LABEL[o.slot.dia]}
                      </div>

                      {/* Número de día */}
                      <div className={`text-2xl font-bold leading-none ${
                        selected ? 'text-white' : full ? 'text-gray-400' : 'text-gray-900'
                      }`}>
                        {o.fecha.getDate()}
                      </div>

                      {/* Hora */}
                      <div className={`text-sm mt-1 font-medium ${
                        selected ? 'text-purple-100' : full ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        {o.slot.horaInicio}–{o.slot.horaFin}
                      </div>

                      {/* Disponibilidad */}
                      {cupoMax > 0 && (
                        <div className="mt-2">
                          <div className={`h-1.5 rounded-full overflow-hidden ${selected ? 'bg-white/30' : 'bg-gray-100'}`}>
                            <div
                              className={`h-full rounded-full transition-all ${
                                selected ? 'bg-white' : pct > 80 ? 'bg-orange-400' : 'bg-purple-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className={`text-xs mt-1 ${
                            selected ? 'text-purple-200' : casi ? 'text-orange-500 font-medium' : 'text-gray-400'
                          }`}>
                            {full ? 'Sin cupos' : casi ? `¡Solo ${cupoDisp} cupos!` : `${cupoDisp} de ${cupoMax} disponibles`}
                          </div>
                        </div>
                      )}

                      {/* Badge seleccionado */}
                      {selected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white flex items-center justify-center">
                          <svg className="w-3 h-3 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Resumen selección */}
      {selectedFecha && selectedSlotIndex !== null && (() => {
        const o = ocurrencias.find(oc => oc.slotIndex === selectedSlotIndex && oc.fechaISO === selectedFecha)
        if (!o) return null
        return (
          <div className="flex items-center gap-2.5 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
            <span className="w-3 h-3 rounded-full bg-purple-600 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-semibold text-purple-900">
                {DIA_LABEL[o.slot.dia]} {o.fecha.getDate()} de {MES_LABEL_FULL[o.fecha.getMonth()]}
              </span>
              <span className="text-purple-600 ml-1">· {o.slot.horaInicio}–{o.slot.horaFin}</span>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

