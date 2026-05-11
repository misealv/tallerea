'use client'
import { useState, useEffect, useCallback } from 'react'

interface Slot {
  index: number
  fecha: string
  cupoLibre: number
  descripcion: string | null
}

interface Props {
  subscriptionId: string
  studentName: string
  workshopTitle: string
  sesionesDisponibles: number
  dependentNombre?: string
  onSuccess?: () => void
}

export default function ReservarClaseModal({
  subscriptionId,
  studentName,
  workshopTitle,
  sesionesDisponibles,
  dependentNombre,
  onSuccess,
}: Props) {
  const [open, setOpen]           = useState(false)
  const [slots, setSlots]         = useState<Slot[]>([])
  const [loading, setLoading]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selected, setSelected]   = useState<number | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState(false)

  const loadSlots = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/tallerista/subscriptions/${subscriptionId}/slots`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar sesiones')
      setSlots(data.slots)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar sesiones')
    } finally {
      setLoading(false)
    }
  }, [subscriptionId])

  useEffect(() => {
    if (open) {
      setSelected(null)
      setSuccess(false)
      setError(null)
      loadSlots()
    }
  }, [open, loadSlots])

  async function handleSubmit() {
    if (selected === null) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/tallerista/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId, slotIndex: selected }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al reservar')
      setSuccess(true)
      onSuccess?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al reservar')
    } finally {
      setSubmitting(false)
    }
  }

  const slotSeleccionado = slots.find(s => s.index === selected)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={sesionesDisponibles <= 0}
        className="inline-flex items-center gap-1 text-xs bg-violet-600 text-white px-2.5 py-1 rounded-lg hover:bg-violet-700 transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
        title={sesionesDisponibles <= 0 ? 'Sin sesiones disponibles' : `Reservar clase para ${dependentNombre ?? studentName}`}
      >
        Reservar clase
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Reservar clase</p>
                <h3 className="font-semibold text-gray-800 text-sm mt-0.5">
                  {dependentNombre ?? studentName}
                  {dependentNombre && (
                    <span className="ml-1.5 text-xs font-normal text-gray-400">(apoderado: {studentName})</span>
                  )}
                </h3>
                <p className="text-xs text-gray-500">{workshopTitle} · {sesionesDisponibles} sesión{sesionesDisponibles !== 1 ? 'es' : ''} disponible{sesionesDisponibles !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            {/* Body */}
            <div className="px-6 py-4 max-h-80 overflow-y-auto">
              {loading && (
                <p className="text-sm text-gray-400 text-center py-6">Cargando sesiones…</p>
              )}

              {!loading && !success && slots.length === 0 && !error && (
                <p className="text-sm text-gray-400 text-center py-6">No hay sesiones futuras con cupo disponible.</p>
              )}

              {!loading && !success && slots.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 mb-3">Selecciona una sesión:</p>
                  {slots.map(slot => {
                    const fecha = new Date(slot.fecha)
                    const fechaStr = fecha.toLocaleDateString('es-CL', {
                      weekday: 'long', day: 'numeric', month: 'long',
                      timeZone: 'America/Santiago',
                    })
                    const horaStr = fecha.toLocaleTimeString('es-CL', {
                      hour: '2-digit', minute: '2-digit',
                      timeZone: 'America/Santiago',
                    })
                    const isSelected = selected === slot.index
                    return (
                      <button
                        key={slot.index}
                        onClick={() => setSelected(slot.index)}
                        className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                          isSelected
                            ? 'border-violet-500 bg-violet-50 text-violet-800'
                            : 'border-gray-200 hover:border-violet-300 hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <span className="font-medium capitalize">{fechaStr}</span>
                        <span className="ml-2 text-gray-500">{horaStr}</span>
                        {slot.cupoLibre <= 2 && (
                          <span className="ml-2 text-xs text-amber-500">({slot.cupoLibre} cupo{slot.cupoLibre !== 1 ? 's' : ''})</span>
                        )}
                        {slot.descripcion && (
                          <p className="text-xs text-gray-400 mt-0.5">{slot.descripcion}</p>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {success && (
                <div className="text-center py-6">
                  <p className="text-green-600 font-medium text-sm">✓ Clase reservada{dependentNombre ? ` para ${dependentNombre}` : ''}</p>
                  {slotSeleccionado && (
                    <p className="text-gray-500 text-xs mt-1">
                      {new Date(slotSeleccionado.fecha).toLocaleDateString('es-CL', {
                        weekday: 'long', day: 'numeric', month: 'long',
                        timeZone: 'America/Santiago',
                      })}
                      {' · '}
                      {new Date(slotSeleccionado.fecha).toLocaleTimeString('es-CL', {
                        hour: '2-digit', minute: '2-digit',
                        timeZone: 'America/Santiago',
                      })}
                    </p>
                  )}
                  <p className="text-gray-400 text-xs mt-2">Se notificó al alumno por email.</p>
                </div>
              )}

              {error && (
                <p className="text-sm text-red-500 mt-2">{error}</p>
              )}
            </div>

            {/* Footer */}
            {!success && (
              <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => setOpen(false)}
                  className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={selected === null || submitting}
                  className="flex-1 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Reservando…' : 'Confirmar reserva'}
                </button>
              </div>
            )}
            {success && (
              <div className="px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => { setOpen(false); setSuccess(false) }}
                  className="w-full px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
