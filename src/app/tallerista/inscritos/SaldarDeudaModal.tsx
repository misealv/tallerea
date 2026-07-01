'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  subscriptionId: string
  studentName: string
  workshopTitle: string
  montoAdeudado: number
}

export default function SaldarDeudaModal({
  subscriptionId,
  studentName,
  workshopTitle,
  montoAdeudado,
}: Props) {
  const [open, setOpen]       = useState(false)
  const [metodo, setMetodo]   = useState<'transferencia' | 'efectivo' | 'mercadopago'>('transferencia')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [initPoint, setInitPoint] = useState<string | null>(null)
  const router = useRouter()

  function handleOpen() {
    setMetodo('transferencia')
    setError(null)
    setSuccess(false)
    setInitPoint(null)
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/tallerista/subscriptions/${subscriptionId}/saldar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metodoPagoFinal: metodo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al saldar la deuda')
      if (data.saldado) {
        setSuccess(true)
        router.refresh()
      } else {
        // MercadoPago: mostrar link para enviar al alumno
        setInitPoint(data.initPoint ?? '')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al saldar la deuda')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg hover:bg-amber-200 transition-colors font-medium"
        title="Registrar el pago de la deuda a confianza"
      >
        💵 Marcar pagada
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Saldar deuda a confianza</p>
                <h3 className="font-semibold text-gray-800 text-sm mt-0.5">{studentName}</h3>
                <p className="text-xs text-gray-500">{workshopTitle}</p>
                <p className="text-xs text-amber-600 mt-1 font-medium">Debe ${(montoAdeudado ?? 0).toLocaleString('es-CL')}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="px-6 py-5">
              {success ? (
                <div className="text-center py-4 space-y-2">
                  <p className="text-2xl">✅</p>
                  <p className="text-green-600 font-semibold text-sm">Deuda saldada</p>
                  <p className="text-xs text-gray-400">Se registró el pago. Ya no aparece como deuda.</p>
                  <button onClick={() => setOpen(false)} className="mt-3 text-xs text-indigo-600 hover:underline">Cerrar</button>
                </div>
              ) : initPoint !== null ? (
                <div className="space-y-3 py-2">
                  <p className="text-xs text-gray-600">
                    Link de pago listo. Envíalo al alumno por WhatsApp. La deuda se marcará como
                    saldada automáticamente cuando MercadoPago confirme el pago.
                  </p>
                  <div className="flex items-center gap-2 bg-emerald-50 rounded-lg px-3 py-2">
                    <input readOnly value={initPoint}
                      className="flex-1 text-xs bg-transparent outline-none text-emerald-700 min-w-0 truncate"
                      onFocus={e => e.target.select()} />
                    <button type="button" onClick={() => navigator.clipboard.writeText(initPoint)}
                      className="shrink-0 text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700">
                      Copiar
                    </button>
                  </div>
                  <button onClick={() => setOpen(false)} className="w-full text-xs text-gray-500 border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50">
                    Cerrar
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">¿Cómo pagó?</label>
                    <select
                      value={metodo}
                      onChange={e => setMetodo(e.target.value as typeof metodo)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                    >
                      <option value="transferencia">Transferencia (me pagó directo)</option>
                      <option value="efectivo">Efectivo (me pagó directo)</option>
                      <option value="mercadopago">MercadoPago (le envío link)</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-400">
                      {metodo === 'mercadopago'
                        ? 'La plataforma cobra su comisión sobre este pago.'
                        : 'Pago directo a ti: la plataforma no cobra comisión.'}
                    </p>
                  </div>

                  {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setOpen(false)}
                      className="flex-1 text-sm text-gray-500 border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors">
                      Cancelar
                    </button>
                    <button type="submit" disabled={saving}
                      className="flex-1 text-sm bg-amber-600 text-white rounded-lg px-4 py-2 hover:bg-amber-700 transition-colors disabled:bg-amber-300">
                      {saving ? 'Procesando…' : metodo === 'mercadopago' ? 'Generar link' : 'Marcar pagada'}
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
