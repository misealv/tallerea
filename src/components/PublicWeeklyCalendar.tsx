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

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
const DIAS_LABEL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Lunes 00:00 local de la semana de la fecha dada
function getMonday(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay() // 0=dom, 1=lun
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function fmtFecha(d: Date): string {
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
}

function fmtRango(monday: Date): string {
  const sunday = addDays(monday, 6)
  return `${fmtFecha(monday)} – ${fmtFecha(sunday)}`
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

export default function PublicWeeklyCalendar({ slots, cupoPorSesion }: Props) {
  const [weekOffset, setWeekOffset] = useState(0)

  const today = useMemo(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t
  }, [])
  const baseMonday = useMemo(() => getMonday(today), [today])
  const currentMonday = useMemo(() => addDays(baseMonday, weekOffset * 7), [baseMonday, weekOffset])
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(currentMonday, i)),
    [currentMonday]
  )

  // Filtrar slots de la semana actual
  const slotsByDay = useMemo(() => {
    const map: Record<number, SlotInput[]> = {}
    for (let i = 0; i < 7; i++) map[i] = []

    for (const s of slots) {
      if (!s.fecha) continue
      const d = new Date(s.fecha)
      const dayIdx = weekDays.findIndex(wd => sameDay(wd, d))
      if (dayIdx >= 0) map[dayIdx].push(s)
    }
    // Ordenar cada día por horaInicio
    for (let i = 0; i < 7; i++) {
      map[i].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
    }
    return map
  }, [slots, weekDays])

  const totalSlotsWeek = Object.values(slotsByDay).reduce((acc, arr) => acc + arr.length, 0)

  return (
    <div className="space-y-3">
      {/* Header con navegación */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setWeekOffset(w => w - 1)}
          className="text-sm text-gray-600 hover:text-purple-700 px-2 py-1 rounded border border-gray-200 hover:border-purple-300"
        >
          ← Semana anterior
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
          Semana siguiente →
        </button>
      </div>

      {totalSlotsWeek === 0 ? (
        <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4 text-center">
          No hay sesiones programadas en esta semana.
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1 text-xs">
          {weekDays.map((d, i) => {
            const isToday = sameDay(d, today)
            const daySlots = slotsByDay[i]
            return (
              <div key={i} className={`rounded-md ${isToday ? 'ring-1 ring-purple-300 bg-purple-50' : 'bg-gray-50'}`}>
                <div className="text-center py-1 border-b border-gray-200">
                  <div className="font-semibold text-gray-700">{DIAS_LABEL[i]}</div>
                  <div className="text-gray-500 text-[10px]">{d.getDate()}/{d.getMonth() + 1}</div>
                </div>
                <div className="p-1 space-y-1 min-h-[60px]">
                  {daySlots.length === 0 ? (
                    <div className="text-center text-gray-300 text-[10px] py-2">—</div>
                  ) : (
                    daySlots.map((s, j) => {
                      const disponibles = cupoPorSesion - (s.reservas || 0)
                      const cancelado = !!s.cancelado
                      const lleno = !cancelado && disponibles <= 0
                      const ok = !cancelado && !lleno
                      return (
                        <div
                          key={j}
                          className={`rounded px-1 py-0.5 text-[10px] leading-tight ${
                            cancelado
                              ? 'bg-gray-200 text-gray-400 line-through'
                              : lleno
                                ? 'bg-red-50 text-red-600 border border-red-100'
                                : 'bg-green-50 text-green-700 border border-green-200'
                          }`}
                          title={
                            cancelado ? 'Sesión cancelada'
                              : lleno ? 'Sin cupos'
                              : `${disponibles} de ${cupoPorSesion} disponibles`
                          }
                        >
                          <div className="font-medium">{s.horaInicio}–{s.horaFin}</div>
                          <div className="text-[9px]">
                            {cancelado ? 'cancelada'
                              : lleno ? 'lleno'
                              : `${disponibles}/${cupoPorSesion}`}
                          </div>
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

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500 pt-1">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-green-50 border border-green-200"></span>
          Disponible
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-red-50 border border-red-100"></span>
          Sin cupos
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-gray-200"></span>
          Cancelada
        </span>
      </div>
    </div>
  )
}
