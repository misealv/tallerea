'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

const DIAS_WEEK = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
const DIA_LABEL: Record<string, string> = {
  lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue',
  viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom',
}
const COLORS = [
  'bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500',
]

function getMonday(d: Date): Date {
  const day = d.getDay()
  const mon = new Date(d)
  mon.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  mon.setHours(0, 0, 0, 0)
  return mon
}
function addDays(date: Date, n: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}
function toDateStr(d: Date): string { return d.toISOString().split('T')[0] }

// [TZ] Día de semana local en America/Santiago (no depende de locale del servidor)
function getChileDow(fechaYYYYMMDD: string): number {
  const [y, m, day] = fechaYYYYMMDD.split('-').map(Number)
  return new Date(y, m - 1, day, 12).getDay()  // 0=Dom, 1=Lun…6=Sáb
}

interface SlotItem {
  workshopId: string; workshopTitulo: string; workshopSlug: string
  slotIndex: number; horaInicio: string; horaFin: string
  fecha: string; cancelado: boolean; reservas: number; cupo: number
}
interface Inscrito { bookingId: string; name: string; email: string; estado: string }

export default function CalendarioTallerista() {
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [slots, setSlots] = useState<SlotItem[]>([])
  const [loading, setLoading] = useState(true)
  const [colorMap, setColorMap] = useState<Map<string, number>>(new Map())
  const [detail, setDetail] = useState<SlotItem | null>(null)
  const [canceling, setCanceling] = useState(false)
  const [inscritos, setInscritos] = useState<Inscrito[]>([])
  const [loadingInscritos, setLoadingInscritos] = useState(false)
  const [cancelingBookingId, setCancelingBookingId] = useState<string | null>(null)

  const fetchSlots = useCallback(async (from: Date) => {
    setLoading(true)
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000)
    const res = await fetch(`/api/tallerista/calendar?from=${toDateStr(from)}&to=${toDateStr(to)}`)
    const data = await res.json()
    if (data.data) {
      setSlots(data.data)
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

  async function openDetail(slot: SlotItem) {
    setDetail(slot)
    setInscritos([])
    if (slot.reservas > 0) {
      setLoadingInscritos(true)
      try {
        const res = await fetch(`/api/tallerista/calendar/students?workshopId=${slot.workshopId}&slotIndex=${slot.slotIndex}`)
        const data = await res.json()
        if (data.data) setInscritos(data.data)
      } catch { /* silent */ } finally { setLoadingInscritos(false) }
    }
  }

  async function cancelarReserva(insc: Inscrito) {
    if (!detail) return
    if (!confirm(`¿Anular la reserva de ${insc.name}? El alumno quedará fuera de esta sesión.`)) return
    setCancelingBookingId(insc.bookingId)
    try {
      const res = await fetch('/api/tallerista/calendar/students', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: insc.bookingId, workshopId: detail.workshopId, slotIndex: detail.slotIndex }),
      })
      if (!res.ok) throw new Error()
      // Actualizar lista local
      setInscritos(prev => prev.filter(i => i.bookingId !== insc.bookingId))
      // Actualizar contador de reservas en slots y modal
      setSlots(prev => prev.map(s =>
        s.workshopId === detail.workshopId && s.slotIndex === detail.slotIndex
          ? { ...s, reservas: Math.max(0, s.reservas - 1) }
          : s
      ))
      setDetail(prev => prev ? { ...prev, reservas: Math.max(0, prev.reservas - 1) } : null)
    } catch { alert('No se pudo anular la reserva.') }
    finally { setCancelingBookingId(null) }
  }

  async function toggleCancelar(slot: SlotItem) {
    setCanceling(true)
    try {
      const res = await fetch('/api/tallerista/calendar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshopId: slot.workshopId, slotIndex: slot.slotIndex, cancelado: !slot.cancelado }),
      })
      if (!res.ok) throw new Error()
      setSlots(prev => prev.map(s =>
        s.workshopId === slot.workshopId && s.slotIndex === slot.slotIndex ? { ...s, cancelado: !s.cancelado } : s
      ))
      setDetail(prev => prev ? { ...prev, cancelado: !prev.cancelado } : null)
    } catch { alert('No se pudo actualizar la sesión.') }
    finally { setCanceling(false) }
  }

  const weekDates = useMemo(() => DIAS_WEEK.map((_, i) => toDateStr(addDays(weekStart, i))), [weekStart])

  const horasUnicas = useMemo(() => {
    const seen = new Set<string>()
    const weekSet = new Set(weekDates)
    slots.forEach(s => { if (weekSet.has(s.fecha)) seen.add(s.horaInicio) })
    return Array.from(seen).sort()
  }, [slots, weekDates])

  const slotByKey = useMemo(() => {
    const m = new Map<string, SlotItem>()
    // La fecha del servidor ya viene en 'YYYY-MM-DD' (zona Chile).
    // getChileDow es solo de apoyo para verificar; la key se construye por fecha directa.
    slots.forEach(s => { getChileDow(s.fecha); m.set(`${s.fecha}|${s.horaInicio}`, s) })
    return m
  }, [slots])

  const today = toDateStr(new Date())
  const weekLabel = weekStart.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })
  const weekEnd = addDays(weekStart, 6).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
  const allWorkshops = Array.from(new Set(slots.map(s => s.workshopId))).map(id => {
    const s = slots.find(x => x.workshopId === id)!
    return { id, titulo: s.workshopTitulo, colorIdx: colorMap.get(id) ?? 0 }
  })

  return (
    <div className="space-y-4" onClick={() => setDetail(null)}>
      {/* Cabecera */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Calendario</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(getMonday(new Date()))}
            className="text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-200">
            Hoy
          </button>
          <button onClick={() => setWeekStart(w => { const d = new Date(w); d.setDate(d.getDate() - 7); return d })}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-200">←</button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 min-w-[200px] text-center">
            {weekLabel} – {weekEnd}
          </span>
          <button onClick={() => setWeekStart(w => { const d = new Date(w); d.setDate(d.getDate() + 7); return d })}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-200">→</button>
        </div>
      </div>

      {/* Leyenda talleres */}
      {allWorkshops.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allWorkshops.map(w => (
            <span key={w.id} className={`text-xs text-white px-2.5 py-1 rounded-full ${COLORS[w.colorIdx]}`}>
              {w.titulo}
            </span>
          ))}
        </div>
      )}

      {/* Tabla semanal */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm border-collapse min-w-[560px]">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <th className="py-2 px-3 text-xs text-gray-400 font-normal text-left w-16">Hora</th>
              {DIAS_WEEK.map((dia, i) => {
                const dateStr = weekDates[i]
                const isToday = dateStr === today
                const d = addDays(weekStart, i)
                const hasSlots = horasUnicas.some(h => slotByKey.has(`${dateStr}|${h}`))
                return (
                  <th key={dia} className="py-2 px-1 text-center">
                    <div className={`text-xs font-semibold ${hasSlots ? 'text-purple-700 dark:text-purple-400' : 'text-gray-400 dark:text-gray-600'}`}>
                      {DIA_LABEL[dia]}
                    </div>
                    <div className={`text-xs mt-0.5 mx-auto flex items-center justify-center rounded-full w-6 h-6 font-semibold
                      ${isToday ? 'bg-purple-600 text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                      {d.getDate()}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">Cargando…</td></tr>
            ) : horasUnicas.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                  Sin sesiones esta semana.{' '}
                  <a href="/tallerista/talleres/nuevo" className="text-purple-600 dark:text-purple-400 hover:underline">Crear taller →</a>
                </td>
              </tr>
            ) : horasUnicas.map(hora => (
              <tr key={hora} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                <td className="py-2 px-3 text-xs text-gray-400 font-mono align-top pt-3">{hora}</td>
                {DIAS_WEEK.map((_, i) => {
                  const dateStr = weekDates[i]
                  const slot = slotByKey.get(`${dateStr}|${hora}`)
                  if (!slot) return <td key={i} className="py-1 px-1" />
                  const colorIdx = colorMap.get(slot.workshopId) ?? 0
                  const isPast = dateStr < today
                  const lleno = slot.reservas >= slot.cupo
                  return (
                    <td key={i} className="py-1 px-1">
                      <div
                        className={`rounded-lg px-2 py-2 text-center text-xs cursor-pointer select-none transition
                          ${slot.cancelado
                            ? 'bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-400'
                            : isPast
                            ? 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500'
                            : `text-white ${COLORS[colorIdx]} hover:opacity-90`
                          }`}
                        onClick={e => { e.stopPropagation(); openDetail(slot) }}
                      >
                        <div className={`font-semibold ${slot.cancelado ? 'line-through' : ''}`}>{slot.horaInicio}</div>
                        <div className={`mt-0.5 ${slot.cancelado ? 'line-through opacity-60' : 'opacity-80'}`}>{slot.horaFin}</div>
                        {slot.cancelado
                          ? <div className="mt-1 text-red-400 font-medium text-[10px]">Cancelada</div>
                          : <div className={`mt-1 opacity-90 text-[10px] ${lleno ? 'font-bold' : ''}`}>{slot.reservas}/{slot.cupo}{lleno ? ' 🔴' : ''}</div>
                        }
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal detalle */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/60 px-4"
          onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4 border border-transparent dark:border-gray-700"
            onClick={e => e.stopPropagation()}>

            {/* Encabezado */}
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <span className={`text-xs text-white px-2 py-0.5 rounded-full ${COLORS[colorMap.get(detail.workshopId) ?? 0]}`}>
                  {detail.workshopTitulo}
                </span>
                <h3 className="font-bold text-gray-900 dark:text-white mt-1">
                  {new Date(detail.fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{detail.horaInicio} – {detail.horaFin}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">✕</button>
            </div>

            {/* Cupos */}
            <div className="flex justify-between items-center text-sm bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
              <span className="text-gray-500 dark:text-gray-400">Inscritos</span>
              <span className={`font-bold ${detail.reservas >= detail.cupo ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
                {detail.reservas} / {detail.cupo}
              </span>
            </div>

            {/* Alertas */}
            {detail.cancelado && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">Sesión cancelada</p>
            )}
            {!detail.cancelado && detail.reservas > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
                ⚠️ {detail.reservas} inscrito{detail.reservas !== 1 ? 's' : ''} — cancelar notificará a los alumnos.
              </p>
            )}

            {/* Lista de inscritos */}
            {detail.reservas > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Alumnos inscritos
                </p>
                {loadingInscritos ? (
                  <p className="text-xs text-gray-400 text-center py-3">Cargando…</p>
                ) : inscritos.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">Sin datos</p>
                ) : (
                  <ul className="space-y-1 max-h-52 overflow-y-auto">
                    {inscritos.map((insc) => (
                      <li key={insc.bookingId} className="flex items-center gap-2.5 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                        <div className="w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 flex items-center justify-center text-[11px] font-bold shrink-0">
                          {insc.name?.charAt(0)?.toUpperCase() ?? '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{insc.name}</p>
                          <p className="text-gray-400 truncate">{insc.email}</p>
                        </div>
                        <button
                          onClick={() => cancelarReserva(insc)}
                          disabled={cancelingBookingId === insc.bookingId}
                          title="Anular reserva"
                          className="shrink-0 text-[10px] font-medium px-2 py-1 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 disabled:opacity-40 transition"
                        >
                          {cancelingBookingId === insc.bookingId ? '…' : 'Anular'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Acciones */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => toggleCancelar(detail)}
                disabled={canceling}
                className={`flex-1 text-sm py-2.5 rounded-lg font-medium transition disabled:opacity-50 ${
                  detail.cancelado
                    ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100'
                    : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100'
                }`}
              >
                {canceling ? '…' : detail.cancelado ? 'Restaurar sesión' : 'Cancelar sesión'}
              </button>
              <a href={`/tallerista/talleres/${detail.workshopId}/inscritos`}
                className="flex-1 text-center text-sm bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 py-2.5 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50">
                Ver taller →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
