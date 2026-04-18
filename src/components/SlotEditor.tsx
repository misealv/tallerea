'use client'

import { useState, useEffect } from 'react'
import SlotCalendar, { type SlotData } from './SlotCalendar'
import SlotList from './SlotList'

interface SlotEditorProps {
  slots: SlotData[]
  duracionSesion: number
  cupoDefault: number
  onSlotsChange: (slots: SlotData[]) => void
}

const DURACIONES = [45, 60, 90, 120]

export default function SlotEditor({ slots, duracionSesion, cupoDefault, onSlotsChange }: SlotEditorProps) {
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // En mobile, forzar vista lista
  const activeView = isMobile ? 'list' : view

  return (
    <div className="space-y-4">
      {/* Toggle vista (solo desktop) */}
      {!isMobile && (
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Horarios de clase</h2>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button type="button"
              onClick={() => setView('calendar')}
              className={`px-3 py-1 text-xs rounded-md transition ${view === 'calendar' ? 'bg-white shadow text-purple-700 font-medium' : 'text-gray-500'}`}>
              📅 Calendario
            </button>
            <button type="button"
              onClick={() => setView('list')}
              className={`px-3 py-1 text-xs rounded-md transition ${view === 'list' ? 'bg-white shadow text-purple-700 font-medium' : 'text-gray-500'}`}>
              📋 Lista
            </button>
          </div>
        </div>
      )}
      {isMobile && <h2 className="font-semibold text-gray-900">Horarios de clase</h2>}

      {activeView === 'calendar' ? (
        <SlotCalendar slots={slots} duracionSesion={duracionSesion} cupoDefault={cupoDefault} onSlotsChange={onSlotsChange} />
      ) : (
        <SlotList slots={slots} duracionSesion={duracionSesion} cupoDefault={cupoDefault} onSlotsChange={onSlotsChange} />
      )}

      {/* Resumen */}
      {slots.length > 0 && (
        <div className="text-xs text-gray-500 flex gap-4">
          <span>{slots.length} bloque{slots.length !== 1 ? 's' : ''}</span>
          <span>{duracionSesion} min/sesión</span>
          <span>{slots.reduce((s, sl) => s + sl.cupoMax, 0)} cupos totales</span>
        </div>
      )}
    </div>
  )
}

// Sub-componente para selección de duración (se usa en el form general del taller)
export function DuracionSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [custom, setCustom] = useState(false)

  return (
    <div>
      <label className="block text-sm text-gray-600 mb-2">Duración de cada sesión</label>
      <div className="flex flex-wrap gap-2">
        {DURACIONES.map(d => (
          <button key={d} type="button"
            onClick={() => { onChange(d); setCustom(false) }}
            className={`px-3 py-1.5 rounded-lg text-sm border transition ${
              !custom && value === d
                ? 'bg-purple-600 text-white border-purple-600'
                : 'border-gray-300 text-gray-600 hover:border-purple-300'
            }`}>
            {d} min
          </button>
        ))}
        <button type="button"
          onClick={() => setCustom(true)}
          className={`px-3 py-1.5 rounded-lg text-sm border transition ${
            custom ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-300 text-gray-600 hover:border-purple-300'
          }`}>
          Otra
        </button>
      </div>
      {custom && (
        <input type="number" min="30" max="240" step="15" value={value}
          onChange={e => onChange(Math.max(30, Math.min(240, Number(e.target.value))))}
          className="mt-2 w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
          placeholder="min" />
      )}
    </div>
  )
}
