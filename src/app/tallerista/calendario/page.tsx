'use client'

import { useState, useEffect, useCallback } from 'react'

const HORA_INI = 7
const HORA_FIN = 22
const CELL_H = 32
const DIAS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const GRID_DAY_IDX = [1, 2, 3, 4, 5, 6, 0]

// Paleta de colores por índice de taller
const COLORS = [
  'bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500',
]
const COLORS_HOVER = [
  'hover:bg-purple-600', 'hover:bg-blue-600', 'hover:bg-green-600', 'hover:bg-orange-600',
  'hover:bg-pink-600', 'hover:bg-teal-600', 'hover:bg-red-600', 'hover:bg-indigo-600',
]

function getMonday(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d)
  mon.setDate(d.getDate() + diff)
  mon.setHours(0, 0, 0, 0)
  return mon
}

// [TZ] Obtener el día de la semana y la fecha YYYY-MM-DD en zona Chile (UTC-3)
function getChileDayInfo(isoString: string): { dow: number; localDateStr: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(isoString))
  const weekday = parts.find(p => p.type === 'weekday')?.value ?? 'Mon'
  const year = parts.find(p => p.type === 'year')?.value
  const month = parts.find(p => p.type === 'month')?.value
  const day = parts.find(p => p.type === 'day')?.value
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { dow: dowMap[weekday] ?? 0, localDateStr: `${year}-${month}-${day}` }
}

function minutesToTop(h: string) {
  const [hh, mm] = h.split(':').map(Number)
  return ((hh * 60 + mm - HORA_INI * 60) / 30) * CELL_H
}

function durationH(ini: string, fin: string) {
  const [hi, mi] = ini.split(':').map(Number)
  const [hf, mf] = fin.split(':').map(Number)
  return Math.max(((hf * 60 + mf - hi * 60 - mi) / 30) * CELL_H, CELL_H)
}

interface SlotItem {
  workshopId: string
  workshopTitulo: string
  workshopSlug: string
  slotIndex: number
  horaInicio: string
  horaFin: string
  fecha: string
  cancelado: boolean
  reservas: number
  cupo: number
}

export default function CalendarioTallerista() {
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [slots, setSlots] = useState<SlotItem[]>([])
  const [loading, setLoading] = useState(true)
  const [colorMap, setColorMap] = useState<Map<string, number>>(new Map())
  const [detail, setDetail] = useState<SlotItem | null>(null)

  const fetchSlots = useCallback(async (from: Date) => {
    setLoading(true)
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000)
    const res = await fetch(
      `/api/tallerista/calendar?from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`
    )
    const data = await res.json()
    if (data.data) {
      setSlots(data.data)
      // Asignar colores estables por workshopId
      setColorMap(prev => {
        const next = new Map(prev)
        let idx = next.size
        for (const s of data.data as SlotItem[]) {
          if (!next.has(s.workshopId)) { next.set(s.workshopId, idx % COLORS.length); idx++ }
        }
        return next
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchSlots(weekStart) }, [weekStart, fetchSlots])

  const weekDays = GRID_DAY_IDX.map((_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  const slotsByDay = new Map<number, SlotItem[]>()
  for (const s of slots) {
    const { dow } = getChileDayInfo(s.fecha)
    const col = GRID_DAY_IDX.indexOf(dow)
    if (col >= 0) {
      const list = slotsByDay.get(col) ?? []
      list.push(s)
      slotsByDay.set(col, list)
    }
  }

  const today = new Date()
  const allWorkshops = Array.from(new Set(slots.map(s => s.workshopId))).map(id => {
    const s = slots.find(x => x.workshopId === id)!
    return { id, titulo: s.workshopTitulo, colorIdx: colorMap.get(id) ?? 0 }
  })

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Calendario</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(getMonday(new Date()))}
            className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">Hoy</button>
          <button onClick={() => setWeekStart(w => { const d = new Date(w); d.setDate(d.getDate() - 7); return d })}
            className="p-2 rounded-lg hover:bg-gray-100">←</button>
          <span className="text-sm font-medium text-gray-700 min-w-[200px] text-center">
            {weekStart.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })} –{' '}
            {weekDays[6].toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <button onClick={() => setWeekStart(w => { const d = new Date(w); d.setDate(d.getDate() + 7); return d })}
            className="p-2 rounded-lg hover:bg-gray-100">→</button>
        </div>
      </div>

      {/* Leyenda de talleres */}
      {allWorkshops.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {allWorkshops.map(w => (
            <span key={w.id} className={`flex items-center gap-1.5 text-xs text-white px-2 py-1 rounded-full ${COLORS[w.colorIdx]}`}>
              {w.titulo}
            </span>
          ))}
        </div>
      )}

      {/* Grilla */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <div className="min-w-[640px]">
          {/* Header */}
          <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b bg-gray-50 sticky top-0 z-10">
            <div />
            {weekDays.map((d, i) => {
              const isToday = d.toDateString() === today.toDateString()
              return (
                <div key={i} className={`py-2 text-center text-xs font-medium ${isToday ? 'text-purple-700' : 'text-gray-600'}`}>
                  <div>{DIAS_SHORT[i]}</div>
                  <div className={`mt-0.5 w-7 h-7 mx-auto flex items-center justify-center rounded-full text-sm font-semibold ${isToday ? 'bg-purple-600 text-white' : 'text-gray-800'}`}>
                    {d.getDate()}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Celdas */}
          <div className="relative" style={{ height: (HORA_FIN - HORA_INI) * 2 * CELL_H }}>
            {loading && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-20">
                <span className="text-sm text-gray-500">Cargando…</span>
              </div>
            )}

            {Array.from({ length: HORA_FIN - HORA_INI }, (_, i) => (
              <div key={i} className="absolute left-0 right-0 border-t border-gray-100 flex"
                style={{ top: i * 2 * CELL_H }}>
                <span className="text-[10px] text-gray-400 w-12 text-right pr-1 -mt-2 select-none">
                  {String(HORA_INI + i).padStart(2, '0')}:00
                </span>
              </div>
            ))}

            {weekDays.map((_, colIdx) => (
              <div key={colIdx} className="absolute top-0 bottom-0 border-l border-gray-100"
                style={{ left: `calc(48px + ${colIdx} * ((100% - 48px) / 7))`, width: `calc((100% - 48px) / 7)` }} />
            ))}

            {weekDays.map((_, colIdx) => {
              const colSlots = slotsByDay.get(colIdx) ?? []
              return colSlots.map((slot, si) => {
                const top = minutesToTop(slot.horaInicio)
                const height = durationH(slot.horaInicio, slot.horaFin)
                const colW = `calc((100% - 48px) / 7)`
                const left = `calc(48px + ${colIdx} * ${colW})`
                const colorIdx = colorMap.get(slot.workshopId) ?? 0
                const lleno = slot.reservas >= slot.cupo

                return (
                  <div key={`${colIdx}-${si}`}
                    className={`absolute text-white text-xs rounded-md px-1.5 py-0.5 overflow-hidden z-10 cursor-pointer transition-colors
                      ${slot.cancelado ? 'bg-gray-300' : `${COLORS[colorIdx]} ${COLORS_HOVER[colorIdx]}`}`}
                    style={{ top: top + 1, height: height - 2, left, width: `calc(${colW} - 3px)` }}
                    onClick={() => setDetail(slot)}
                  >
                    <div className="font-semibold truncate">{slot.horaInicio}</div>
                    {height > CELL_H && (
                      <div className="opacity-90 truncate">
                        {slot.cancelado ? 'Cancelado' : `${slot.reservas}/${slot.cupo}${lleno ? ' 🔴' : ''}`}
                      </div>
                    )}
                  </div>
                )
              })
            })}
          </div>
        </div>
      </div>

      {slots.length === 0 && !loading && (
        <p className="text-sm text-gray-400 text-center py-8">
          No hay sesiones programadas esta semana.{' '}
          <a href="/tallerista/talleres/nuevo" className="text-purple-600 hover:underline">Crear taller →</a>
        </p>
      )}

      {/* Modal detalle de slot */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 space-y-3" onClick={e => e.stopPropagation()}>
            <div className={`text-xs text-white px-2 py-0.5 rounded-full w-fit ${COLORS[colorMap.get(detail.workshopId) ?? 0]}`}>
              {detail.workshopTitulo}
            </div>
            <h3 className="font-bold text-gray-900">
              {new Date(detail.fecha).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            <p className="text-sm text-gray-700">{detail.horaInicio} – {detail.horaFin}</p>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Inscritos</span>
              <span className={`font-semibold ${detail.reservas >= detail.cupo ? 'text-red-600' : 'text-green-700'}`}>
                {detail.reservas} / {detail.cupo}
              </span>
            </div>
            {detail.cancelado && (
              <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">Sesión cancelada</p>
            )}
            <div className="flex gap-2 pt-2">
              <a href={`/tallerista/talleres/${detail.workshopId}/inscritos`}
                className="flex-1 text-center text-sm bg-purple-50 text-purple-700 py-2 rounded-lg hover:bg-purple-100">
                Ver inscritos
              </a>
              <button onClick={() => setDetail(null)}
                className="flex-1 text-sm bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
