'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  subscriptionId: string
  precioActual: number
  notaActual?: string
  onUpdated?: (nuevoPrecio: number) => void
}

export default function EditarPrecioButton({ subscriptionId, precioActual, notaActual, onUpdated }: Props) {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [precio, setPrecio]   = useState(String(precioActual))
  const [razon, setRazon]     = useState(notaActual ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleSave() {
    setError('')
    const montoNum = Number(precio)
    if (!Number.isInteger(montoNum) || montoNum < 0) {
      setError('El monto debe ser un número entero ≥ 0')
      return
    }
    if (!razon.trim()) {
      setError('La razón del cambio es obligatoria')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/tallerista/suscripciones/${subscriptionId}/precio`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precioSnapshot: montoNum, notaPrecioEspecial: razon.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al guardar'); return }
      onUpdated?.(montoNum)
      setOpen(false)
      router.refresh()  // refresca Server Component para mostrar precio actualizado
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-indigo-600 hover:underline whitespace-nowrap"
      >
        Editar precio
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-800">Editar precio especial</h3>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
            )}

            <div>
              <label className="block text-xs text-gray-500 mb-1">Nuevo precio (CLP) *</label>
              <input
                type="number" min={0} step={1} value={precio}
                onChange={e => setPrecio(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              {Number(precio) === 0 && (
                <p className="text-xs text-violet-600 mt-1">Precio $0 → se mostrará como &quot;Becado&quot;</p>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Razón del cambio * <span className="text-gray-400">(queda en auditoría)</span></label>
              <textarea
                rows={2} value={razon} onChange={e => setRazon(e.target.value)}
                placeholder="Ej: alumna desde 2023, tarifa congelada"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={loading}
                className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {loading ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
