'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  subscriptionId: string
  studentName: string
  workshopTitle: string
  montoEsperado: number
}

export default function ConfirmarPagoModal({
  subscriptionId,
  studentName,
  workshopTitle,
  montoEsperado,
}: Props) {
  const [open, setOpen]           = useState(false)
  const [metodo, setMetodo]       = useState<'transferencia' | 'efectivo' | 'otro'>('transferencia')
  const [monto, setMonto]         = useState(String(montoEsperado))
  const [nota, setNota]           = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState(false)
  const router = useRouter()

  function handleOpen() {
    setMetodo('transferencia')
    setMonto(String(montoEsperado))
    setNota('')
    setError(null)
    setSuccess(false)
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const montoInt = parseInt(monto, 10)
    if (!Number.isInteger(montoInt) || montoInt < 0) {
      setError('El monto debe ser un entero CLP válido')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/subscriptions/${subscriptionId}/confirmar-pago`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metodoPago: metodo, montoDeclarado: montoInt, nota: nota.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al confirmar')
      setSuccess(true)
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al confirmar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-lg hover:bg-green-200 transition-colors font-medium"
        title="Registrar pago externo y activar"
      >
        ✓ Activar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Confirmar pago externo</p>
                <h3 className="font-semibold text-gray-800 text-sm mt-0.5">{studentName}</h3>
                <p className="text-xs text-gray-500">{workshopTitle}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="px-6 py-5">
              {success ? (
                <div className="text-center py-4 space-y-2">
                  <p className="text-2xl">✅</p>
                  <p className="text-green-600 font-semibold text-sm">Suscripción activada</p>
                  <p className="text-xs text-gray-400">El alumno ya puede reservar clases.</p>
                  <button onClick={() => setOpen(false)} className="mt-3 text-xs text-indigo-600 hover:underline">Cerrar</button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Método de pago</label>
                    <select
                      value={metodo}
                      onChange={e => setMetodo(e.target.value as typeof metodo)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                    >
                      <option value="transferencia">Transferencia bancaria</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Monto recibido (CLP)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={monto}
                      onChange={e => setMonto(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nota interna (opcional)</label>
                    <input
                      type="text"
                      value={nota}
                      onChange={e => setNota(e.target.value)}
                      maxLength={300}
                      placeholder="Ej: transferencia del 1-jun comprobante #123"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                    />
                  </div>

                  {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setOpen(false)}
                      className="flex-1 text-sm text-gray-500 border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors">
                      Cancelar
                    </button>
                    <button type="submit" disabled={saving}
                      className="flex-1 text-sm bg-green-600 text-white rounded-lg px-4 py-2 hover:bg-green-700 transition-colors disabled:bg-green-300">
                      {saving ? 'Activando…' : 'Activar clases'}
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
