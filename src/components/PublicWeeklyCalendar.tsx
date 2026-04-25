'use client'

import { useState, useMemo } from 'react'

interface SlotInput {
  fecha?: string | Date
  dia?: string
  horaInicio: string
  horaFin: string
  reservas?: number
  cancelado?: boolean
}

interface Props {
  slots: SlotInput[]
  cupoPorSesion: number
}

const DIAS_LABEL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Todas las comparaciones usan UTC para coincidir con cómo el servidor genera los slots
function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function getMondayUTC(date: Date): Date {
  const d = utcMidnight(date)
  const dow = d.getUTCDay() // 0=dom, 1=lun, ..., 6=sáb
  const diff = dow === 0 ? -6 : 1 - dow
  d.setUTCDate(d.getUTCDate() + diff)
  return d
}

function addDaysUTC(date: Date, n: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

function sameDayUTC(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate()
}

function fmtDia(d: Date): string {
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`
}

function fmtRango(monday: Date): string {
  const sunday = addDaysUTC(monday, 6)
  return `${fmtDia(monday)} – ${fmtDia(sunday)}`
}

export default function PublicWeeklyCalendar({ slots, cupoPorSesion }: Props) {
  const [weekOffset, setWeekOffset] = useState(0)

  const todayUTC = useMemo(() => utcMidnight(new Date()), [])
  const baseMonday = useMemo(() => getMondayUTC(todayUTC), [todayUTC])
  const currentMonday = useMemo(() => addDaysUTC(baseMonday, weekOffset * 7), [baseMonday, weekOffset])
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysUTC(currentMonday, i)),
    [currentMonday]
  )

  const slotsByDay = useMemo(() => {
    const map: Record<number, SlotInput[]> = {}
    for (let i = 0; i < 7; i++) map[i] = []

    for (const s of slots) {
      if (!s.fecha) continue
      const d = new Date(s.fecha)
      const dayIdx = weekDays.findIndex(wd => sameDayUTC(wd, d))
      if (dayIdx >= 0) map[dayIdx].push(s)
    }
    for (let i = 0; i < 7; i++) {
      map[i].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
    }
    return map
  }, [slots, weekDays])

  const totalSlotsWeek = Object.values(slotsByDay).reduce((acc, arr) => acc + arr.length, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setWeekOffset(w => w - 1)}
          className="text-sm text-gray-600 hover:text-purple-700 px-2 py-1 rounded border border-gray-200 hover:border-purple-300"
        >
          ← Anterior
        </button>
        <div className="text-sm font-medium text-gray-700">
          {fmtRango(currentMonday)}
          {weekOffset === 0 && <span className="ml-2 text-xs text-purple-600">(esta semana)</span>}
        </div>
        <button
          type="button"
          onClick={() => setWeekOffset(w => w + 1)}
          className="text-sm text-gray-600 hover:text-purple-700 px-2 py-1 rounded border border-gray-200 hover:border-purple-300"
        >
          Siguiente →
        </button>
      </div>

      {totalSlotsWeek === 0 ? (
        <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4 text-center">
          No hay sesiones programadas esta semana.
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1 text-xs">
          {weekDays.map((d, i) => {
            const isToday = sameDayUTC(d, todayUTC)
            const daySlots = slotsByDay[i]
            return (
              <div key={i} className={`rounded-md ${isToday ? 'ring-1 ring-purple-300 bg-purple-50' : 'bg-gray-50'}`}>
                <div className="text-center py-1 border-b border-gray-200">
                  <div className="font-semibold text-gray-700">{DIAS_LABEL[i]}</div>
                  <div className="text-gray-500 text-[10px]">{fmtDia(d)}</div>
                </div>
                <div className="p-1 space-y-1 min-h-[48px]">
                  {daySlots.length === 0 ? (
                    <div className="text-center text-gray-300 text-[10px] py-2">—</div>
                  ) : (
                    daySlots.map((s, j) => {
                      const disponibles = cupoPorSesion - (s.reservas || 0)
                      const cancelado = !!s.cancelado
                      const lleno = !cancelado && disponibles <= 0
                      return (
                        <div
                          key={j}
                          className={`rounded px-1 py-0.5 text-center font-medium text-[11px] ${
                            cancelado
                              ? 'bg-gray-200 text-gray-400 line-through'
                              : lleno
                                ? 'bg-red-50 text-red-600 border border-red-100'
                                : 'bg-green-50 text-green-700 border border-green-200'
                          }`}
                          title={
                            cancelado
                              ? 'Sesión cancelada'
                              : lleno
                                ? `${s.horaInicio}–${s.horaFin} · Sin cupos`
                                : `${s.horaInicio}–${s.horaFin} · ${disponibles} de ${cupoPorSesion} disponibles`
                          }
                        >
                          {s.horaInicio}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500 pt-1">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-green-50 border border-green-200" />
          Disponible
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-red-50 border border-red-100" />
          Sin cupos
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-gray-200" />
          Cancelada
        </span>
      </div>
    </div>
  )
}
