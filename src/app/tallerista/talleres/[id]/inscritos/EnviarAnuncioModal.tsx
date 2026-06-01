'use client'

import { useState } from 'react'

interface Props {
  workshopId: string
  workshopTitle: string
  alumnosCount: number
}

const PLANTILLAS: Record<string, { asunto: string; mensaje: string }> = {
  suspension: {
    asunto: 'Aviso: clase suspendida',
    mensaje: 'Hola,\n\nLes informo que la clase del [día y hora] queda suspendida por [motivo].\n\nLa recuperaremos el [nueva fecha y hora]. Cualquier duda, pueden responder este correo.\n\nSaludos.',
  },
  cambio_horario: {
    asunto: 'Cambio de horario',
    mensaje: 'Hola,\n\nA partir del [fecha], el horario de la clase cambia a [nuevo día y hora].\n\nLes pido confirmar recibido. Saludos.',
  },
  recordatorio: {
    asunto: 'Recordatorio de clase',
    mensaje: 'Hola,\n\nLes recuerdo que mañana tenemos clase a las [hora] en [lugar].\n\nMateriales que necesitan traer: [lista].\n\nNos vemos.',
  },
}

export default function EnviarAnuncioModal({ workshopId, workshopTitle, alumnosCount }: Props) {
  const [open, setOpen] = useState(false)
  const [asunto, setAsunto] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ sent: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState(false)

  function aplicarPlantilla(key: string) {
    const p = PLANTILLAS[key]
    if (p) { setAsunto(p.asunto); setMensaje(p.mensaje) }
  }

  async function handleSubmit() {
    if (!confirmar) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/tallerista/talleres/${workshopId}/anuncio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asunto: asunto.trim(), mensaje: mensaje.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al enviar')
      setResult({ sent: data.sent, skipped: data.skipped })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setOpen(false); setAsunto(''); setMensaje(''); setResult(null); setError(null); setConfirmar(false)
  }

  if (alumnosCount === 0) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm"
      >
        ✉️ Enviar aviso a alumnos ({alumnosCount})
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={reset}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 rounded-t-xl">
              <h2 className="text-lg font-semibold">Enviar aviso</h2>
              <p className="text-sm opacity-90">{workshopTitle} · {alumnosCount} alumno{alumnosCount === 1 ? '' : 's'}</p>
            </div>

            <div className="p-6 space-y-4">
              {result ? (
                <div className="text-center py-6">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="text-lg font-medium text-gray-900">Aviso enviado</p>
                  <p className="text-sm text-gray-600 mt-2">
                    {result.sent} entregado{result.sent === 1 ? '' : 's'}
                    {result.skipped > 0 ? `, ${result.skipped} con problema` : ''}
                  </p>
                  <button onClick={reset} className="mt-5 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm">Cerrar</button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Plantilla rápida</label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => aplicarPlantilla('suspension')} className="px-3 py-1.5 text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-md border border-amber-200">Suspensión de clase</button>
                      <button type="button" onClick={() => aplicarPlantilla('cambio_horario')} className="px-3 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-md border border-blue-200">Cambio de horario</button>
                      <button type="button" onClick={() => aplicarPlantilla('recordatorio')} className="px-3 py-1.5 text-xs bg-green-50 hover:bg-green-100 text-green-800 rounded-md border border-green-200">Recordatorio</button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Asunto</label>
                    <input
                      type="text"
                      value={asunto}
                      onChange={e => setAsunto(e.target.value)}
                      maxLength={150}
                      placeholder="ej: Clase del jueves suspendida"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mensaje</label>
                    <textarea
                      value={mensaje}
                      onChange={e => setMensaje(e.target.value)}
                      maxLength={5000}
                      rows={9}
                      placeholder="Escribe aquí el aviso..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Los saltos de línea se respetan. Mín 10 caracteres.</p>
                  </div>

                  {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={confirmar} onChange={e => setConfirmar(e.target.checked)} className="mt-1" />
                      <span>Confirmo que quiero enviar este aviso a <strong>{alumnosCount}</strong> alumno{alumnosCount === 1 ? '' : 's'}. El correo aparecerá como enviado por mí (responder llega a mi email).</span>
                    </label>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={reset} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
                    <button
                      onClick={handleSubmit}
                      disabled={!confirmar || loading || asunto.trim().length < 3 || mensaje.trim().length < 10}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg"
                    >
                      {loading ? 'Enviando...' : 'Enviar aviso'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
