'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  subscriptionId: string
  studentName: string
  workshopTitle: string
  precioActual: number
  fechaVencimientoActual: string   // ISO string
  notaActual?: string
  clasesCantidadActual?: number
  sesionesUsadas?: number
  autoRenovarActual?: boolean
  onSuccess?: () => void
}

export default function EditarSuscripcionModal({
  subscriptionId,
  studentName,
  workshopTitle,
  precioActual,
  fechaVencimientoActual,
  notaActual,
  clasesCantidadActual,
  sesionesUsadas = 0,
  autoRenovarActual = false,
  onSuccess,
}: Props) {
  const [open, setOpen]           = useState(false)
  const [precio, setPrecio]       = useState(String(precioActual))
  const [cantidad, setCantidad]   = useState(String(clasesCantidadActual ?? ''))
  const [autoRenovar, setAutoR]   = useState(autoRenovarActual)
  const fechaDefault = fechaVencimientoActual
    ? new Date(fechaVencimientoActual).toISOString().slice(0, 10)
    : ''
  const [fecha, setFecha]         = useState(fechaDefault)
  const [nota, setNota]           = useState(notaActual ?? '')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState(false)
  const router = useRouter()

  function handleOpen() {
    setPrecio(String(precioActual))
    setCantidad(String(clasesCantidadActual ?? ''))
    setAutoR(autoRenovarActual)
    setFecha(fechaDefault)
    setNota(notaActual ?? '')
    setError(null)
    setSuccess(false)
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const precioInt = parseInt(precio, 10)
    if (!Number.isInteger(precioInt) || precioInt < 0) {
      setError('El precio debe ser un entero CLP válido (0 o mayor)')
      setSaving(false)
      return
    }
    if (!fecha) {
      setError('Debes ingresar una fecha de vencimiento')
      setSaving(false)
      return
    }
    const cantidadInt = cantidad.trim() ? parseInt(cantidad, 10) : undefined
    if (cantidadInt !== undefined && (!Number.isInteger(cantidadInt) || cantidadInt < 1)) {
      setError('La cantidad de clases debe ser un entero mayor a 0')
      setSaving(false)
      return
    }

    // La API valida que fecha sea futura; enviamos como ISO UTC medianoche
    const fechaISO = new Date(fecha + 'T23:59:59.000Z').toISOString()

    try {
      const body: Record<string, unknown> = {
        precioSnapshot:   precioInt,
        fechaVencimiento: fechaISO,
      }
      if (nota.trim()) body.notaPrecioEspecial = nota.trim()
      if (cantidadInt !== undefined) body.clasesCantidad = cantidadInt
      if (autoRenovar !== autoRenovarActual) body.autoRenovar = autoRenovar

      const res = await fetch(`/api/subscriptions/${subscriptionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setSuccess(true)
      router.refresh()
      onSuccess?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-lg hover:bg-gray-200 transition-colors"
        title="Editar precio especial o fecha de vencimiento"
      >
        Editar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Editar suscripción</p>
                <h3 className="font-semibold text-gray-800 text-sm mt-0.5">{studentName}</h3>
                <p className="text-xs text-gray-500">{workshopTitle}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="px-6 py-5">
              {success ? (
                <div className="text-center py-4">
                  <p className="text-green-600 font-medium text-sm">✓ Cambios guardados</p>
                  <p className="text-xs text-gray-400 mt-1">Los cambios se aplican en el próximo ciclo de renovación.</p>
                  <button
                    onClick={() => setOpen(false)}
                    className="mt-4 text-xs text-indigo-600 hover:underline"
                  >
                    Cerrar
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Clases por ciclo
                    </label>
                    <input
                      type="number"
                      min={sesionesUsadas || 1}
                      step="1"
                      value={cantidad}
                      onChange={e => setCantidad(e.target.value)}
                      placeholder="Ej: 4"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <p className="text-xs text-gray-400 mt-1">Mínimo {sesionesUsadas} (ya consumidas). Deja vacío para no cambiar.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Precio mensual (CLP)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={precio}
                      onChange={e => setPrecio(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      required
                    />
                    <p className="text-xs text-gray-400 mt-1">Se usará en la próxima renovación.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Fecha de vencimiento (próximo cobro)
                    </label>
                    <input
                      type="date"
                      value={fecha}
                      onChange={e => setFecha(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      required
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id={`auto-${subscriptionId}`}
                      type="checkbox"
                      checked={autoRenovar}
                      onChange={e => setAutoR(e.target.checked)}
                    />
                    <label htmlFor={`auto-${subscriptionId}`} className="text-sm text-gray-700">
                      Auto-renovar al vencer
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Nota interna (opcional)
                    </label>
                    <input
                      type="text"
                      value={nota}
                      onChange={e => setNota(e.target.value)}
                      maxLength={500}
                      placeholder="Ej: descuento familiar"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>

                  {error && (
                    <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="flex-1 text-sm text-gray-500 border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 text-sm bg-indigo-600 text-white rounded-lg px-4 py-2 hover:bg-indigo-700 transition-colors disabled:bg-indigo-300"
                    >
                      {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
