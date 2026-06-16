'use client'

import { useState } from 'react'

interface Props {
  subscriptionId: string
  precioSnapshot: number
  clasesCantidad: number
  studentName: string
}

export default function GenerarLinkRenovacionButton({
  subscriptionId,
  precioSnapshot,
  clasesCantidad,
  studentName,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [initPoint, setInitPoint] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleGenerar() {
    setError('')
    setInitPoint(null)
    setCopied(false)
    setLoading(true)
    try {
      const res = await fetch(`/api/tallerista/subscriptions/${subscriptionId}/generar-link-renovacion`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al generar'); return }
      setInitPoint(data.initPoint)
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    if (!initPoint) return
    navigator.clipboard.writeText(initPoint)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (initPoint) {
    return (
      <div className="flex flex-col gap-1 min-w-0">
        <input
          readOnly
          value={initPoint}
          className="text-xs border border-emerald-300 rounded px-2 py-1 bg-emerald-50 text-emerald-800 w-40 truncate outline-none"
          onFocus={e => e.target.select()}
          title={initPoint}
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleCopy}
            className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded hover:bg-emerald-700 transition-colors"
          >
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
          <button
            type="button"
            onClick={() => { setInitPoint(null); setError('') }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleGenerar}
        disabled={loading}
        title={`Generar link de cobro para ${studentName} — $${precioSnapshot.toLocaleString('es-CL')} / ${clasesCantidad} clases`}
        className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-2 py-1 rounded transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        {loading ? '…' : '🔗 Link cobro'}
      </button>
      {error && <p className="text-xs text-red-600 max-w-[10rem] leading-tight">{error}</p>}
    </div>
  )
}
