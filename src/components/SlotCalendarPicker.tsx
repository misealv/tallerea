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
const DIAS_ORDEN = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'] as const
const DIA_LABEL: Record<string, string> = {
  lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue',
  viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom',
}
const MES_LABEL = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
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

function getMondayISO(d: Date): string {
  const day = new Date(d)
  const jsDay = day.getDay()
  day.setDate(day.getDate() - (jsDay === 0 ? 6 : jsDay - 1))
  return toISODate(day)
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
  const ocurrencias = useMemo(() => generarOcurrencias(slots, fechaInicio, 8), [slots, fechaInicio])

  const semanaMap = useMemo(() => {
    const map = new Map<string, Ocurrencia[]>()
    for (const o of ocurrencias) {
      const key = getMondayISO(o.fecha)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(o)
    }
    return map
  }, [ocurrencias])

  const semanas = useMemo(() => Array.from(semanaMap.keys()).sort(), [semanaMap])
  const diasConSlots = useMemo(() => DIAS_ORDEN.filter(d => slots.some(s => s.dia === d)), [slots])

  if (!ocurrencias.length) return null

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-900">Elige tu fecha</h3>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium whitespace-nowrap">Semana</th>
              {diasConSlots.map(d => (
                <th key={d} className="px-3 py-2 text-center text-xs text-gray-700 font-semibold">
                  {DIA_LABEL[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {semanas.map((lunesISO, sIdx) => {
              const ocurrSemana = semanaMap.get(lunesISO) ?? []
              const lunes = toLocal(lunesISO)
              const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6)
              const mL = lunes.getMonth(); const mD = domingo.getMonth()
              const weekLabel = mL === mD
                ? `${lunes.getDate()}–${domingo.getDate()} ${MES_LABEL[mL]}`
                : `${lunes.getDate()} ${MES_LABEL[mL]} – ${domingo.getDate()} ${MES_LABEL[mD]}`

              return (
                <tr key={lunesISO} className={`border-b border-gray-100 last:border-0 ${sIdx % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                  <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap align-middle">{weekLabel}</td>
                  {diasConSlots.map(dia => {
                    const o = ocurrSemana.find(oc => oc.slot.dia === dia)
                    if (!o) return <td key={dia} className="px-3 py-2" />

                    const cupoMax = o.slot.cupoMax ?? cupoPorSesion ?? 0
                    const cupoDisp = o.slot.cupoDisponible !== undefined
                      ? o.slot.cupoDisponible
                      : cupoMax > 0
                        ? Math.max(0, cupoMax - (o.slot.reservas ?? 0))
                        : 0
                    const disponible = cupoDisp
                    const full = cupoMax > 0 ? disponible <= 0 : false
                    const selected = selectedSlotIndex === o.slotIndex && selectedFecha === o.fechaISO
                    const pct = cupoMax > 0
                      ? Math.round(((cupoMax - disponible) / cupoMax) * 100)
                      : 0

                    return (
                      <td key={dia} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          disabled={full}
                          onClick={() => onSelect(o.slotIndex, o.fechaISO)}
                          className={`w-full rounded-lg px-2 py-2.5 text-xs transition-all border ${
                            selected
                              ? 'bg-purple-600 text-white border-purple-600 ring-2 ring-purple-300'
                              : full
                              ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                              : 'bg-white text-purple-900 border-purple-200 hover:bg-purple-50 hover:border-purple-400 cursor-pointer'
                          }`}
                        >
                          <div className="font-bold text-base leading-none">{o.fecha.getDate()}</div>
                          <div className={`text-[10px] mt-0.5 ${selected ? 'text-purple-200' : 'text-gray-500'}`}>
                            {o.slot.horaInicio}
                          </div>
                          {cupoMax > 0 && (
                            <>
                              <div className={`mt-1.5 h-1 rounded-full overflow-hidden ${selected ? 'bg-white/30' : 'bg-gray-200'}`}>
                                <div
                                  className={`h-full rounded-full ${
                                    selected ? 'bg-white' : pct > 80 ? 'bg-orange-400' : 'bg-purple-500'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <div className={`text-[10px] mt-0.5 ${selected ? 'text-purple-200' : 'text-gray-400'}`}>
                                {full ? 'Lleno' : `${disponible}/${cupoMax}`}
                              </div>
                            </>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selectedFecha && selectedSlotIndex !== null && (() => {
        const o = ocurrencias.find(oc => oc.slotIndex === selectedSlotIndex && oc.fechaISO === selectedFecha)
        if (!o) return null
        return (
          <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 rounded-lg px-3 py-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-600 flex-shrink-0" />
            <span className="font-medium">
              {DIA_LABEL[o.slot.dia]} {o.fecha.getDate()} de {MES_LABEL_FULL[o.fecha.getMonth()]} · {o.slot.horaInicio}–{o.slot.horaFin}
            </span>
            <span className="text-purple-400 text-xs">({(o.slot.cupoDisponible ?? 0)} cupos)</span>
          </div>
        )
      })()}
    </div>
  )
}

