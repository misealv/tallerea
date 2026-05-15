'use client'

import { useState } from 'react'

interface PaqueteCardProps {
  subscriptionId: string
  workshopTitulo: string
  dependentNombre?: string | null
  // Valores iniciales
  cantidad: number
  sesionesUsadas: number
  sesionesDisponibles: number
  precio: number
  caducaEn?: string | null   // ISO yyyy-mm-dd
  autoRenovar: boolean
  notaPrecio?: string | null
}

export default function PaqueteCard(props: PaqueteCardProps) {
  const [editando, setEditando] = useState(false)
  const [cantidad, setCantidad] = useState(props.cantidad || 0)
  const [precio, setPrecio] = useState(props.precio || 0)
  const [caducaEn, setCaducaEn] = useState(props.caducaEn?.slice(0, 10) ?? '')
  const [autoRenovar, setAutoRenovar] = useState(props.autoRenovar)
  const [notaPrecio, setNotaPrecio] = useState(props.notaPrecio ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  // Valores guardados (para mostrar después de guardar)
  const [savedCantidad, setSavedCantidad] = useState(props.cantidad || 0)
  const [savedPrecio, setSavedPrecio] = useState(props.precio || 0)
  const [savedCaducaEn, setSavedCaducaEn] = useState(props.caducaEn ?? '')
  const [savedAutoRenovar, setSavedAutoRenovar] = useState(props.autoRenovar)
  const [savedNota, setSavedNota] = useState(props.notaPrecio ?? '')

  const incompleto = !savedCantidad || !savedPrecio
  const formatoCLP = (n: number) => n > 0 ? `$${n.toLocaleString('es-CL')}` : '—'
  const formatoFecha = (s: string) => {
    if (!s) return '—'
    const d = new Date(s)
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  async function guardar() {
    setError(''); setOkMsg(''); setGuardando(true)
    try {
      const body: Record<string, unknown> = {}
      if (cantidad !== savedCantidad) body.cantidad = cantidad
      if (precio !== savedPrecio) body.precio = precio
      const caducaActual = savedCaducaEn?.slice(0, 10) ?? ''
      if (caducaEn !== caducaActual) body.caducaEn = caducaEn || null
      if (autoRenovar !== savedAutoRenovar) body.autoRenovar = autoRenovar
      if ((notaPrecio ?? '') !== (savedNota ?? '')) body.notaPrecio = notaPrecio || null

      if (Object.keys(body).length === 0) {
        setEditando(false); setGuardando(false); return
      }

      const res = await fetch(`/api/tallerista/subscriptions/${props.subscriptionId}/paquete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error desconocido'); setGuardando(false); return }

      setSavedCantidad(data.sesionesTotales)
      setSavedPrecio(data.precioSnapshot ?? data.monto ?? 0)
      setSavedCaducaEn(data.caducaEn ?? '')
      setSavedAutoRenovar(data.autoRenovar)
      setSavedNota(data.notaPrecioEspecial ?? '')
      setOkMsg('Paquete actualizado')
      setEditando(false)
    } catch {
      setError('Error de red')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden ${incompleto ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <div className="px-5 py-3 border-b flex items-center justify-between gap-3"
        style={{ background: incompleto ? '#fef3c7' : '#f9fafb' }}>
        <div className="min-w-0">
          <p className="font-medium text-gray-800 text-sm truncate">{props.workshopTitulo}</p>
          {props.dependentNombre && (
            <p className="text-xs text-gray-500 truncate">Para: {props.dependentNombre}</p>
          )}
        </div>
        {!editando && (
          <button onClick={() => { setEditando(true); setOkMsg('') }}
            className="shrink-0 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700">
            Editar paquete
          </button>
        )}
      </div>

      {!editando && (
        <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400">Clases por ciclo</p>
            <p className="font-semibold text-gray-800">{savedCantidad || '—'}</p>
            <p className="text-xs text-gray-400">{props.sesionesUsadas} usadas · {props.sesionesDisponibles} disponibles</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Precio mensual</p>
            <p className={`font-semibold ${savedPrecio ? 'text-gray-800' : 'text-amber-700'}`}>{formatoCLP(savedPrecio)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Próximo cobro</p>
            <p className="font-semibold text-gray-800">{formatoFecha(savedCaducaEn)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Auto-renovar</p>
            <p className={`font-semibold ${savedAutoRenovar ? 'text-emerald-700' : 'text-gray-500'}`}>
              {savedAutoRenovar ? 'Sí' : 'No'}
            </p>
          </div>
          {savedNota && (
            <div className="col-span-2 sm:col-span-4">
              <p className="text-xs text-gray-400">Nota</p>
              <p className="text-xs text-gray-600">{savedNota}</p>
            </div>
          )}
          {incompleto && (
            <div className="col-span-2 sm:col-span-4 text-xs text-amber-800 bg-amber-100 rounded px-2 py-1">
              ⚠️ Paquete incompleto. Sin precio o cantidad el cron no podrá generar el link de pago automático.
            </div>
          )}
          {okMsg && (
            <div className="col-span-2 sm:col-span-4 text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1">
              {okMsg}
            </div>
          )}
        </div>
      )}

      {editando && (
        <div className="px-5 py-4 space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Clases por ciclo</label>
              <input type="number" min={1} value={cantidad}
                onChange={e => setCantidad(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <p className="text-xs text-gray-400 mt-1">Mínimo {props.sesionesUsadas} (ya consumidas)</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Precio mensual (CLP)</label>
              <input type="number" min={1} value={precio}
                onChange={e => setPrecio(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <p className="text-xs text-gray-400 mt-1">Invalida el link MP cacheado si cambia</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Próximo cobro (caducidad)</label>
              <input type="date" value={caducaEn}
                onChange={e => setCaducaEn(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input id={`auto-${props.subscriptionId}`} type="checkbox" checked={autoRenovar}
                onChange={e => setAutoRenovar(e.target.checked)} />
              <label htmlFor={`auto-${props.subscriptionId}`} className="text-sm text-gray-700">
                Auto-renovar al vencer
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Nota (opcional)</label>
              <input type="text" value={notaPrecio} maxLength={500}
                onChange={e => setNotaPrecio(e.target.value)}
                placeholder="Ej: precio acordado fuera del sistema"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>

          {error && <div className="text-xs text-red-700 bg-red-50 rounded px-2 py-1">{error}</div>}

          <div className="flex gap-2 justify-end">
            <button onClick={() => {
                setCantidad(savedCantidad); setPrecio(savedPrecio)
                setCaducaEn(savedCaducaEn?.slice(0, 10) ?? '')
                setAutoRenovar(savedAutoRenovar); setNotaPrecio(savedNota ?? '')
                setError(''); setEditando(false)
              }}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={guardar} disabled={guardando}
              className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
