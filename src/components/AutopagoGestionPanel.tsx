'use client'

/**
 * AutopagoGestionPanel
 * Muestra el estado del mandato activo y permite pausar, reactivar,
 * cambiar tarjeta y cancelar el pago automático.
 * Se monta cuando pagoAutomatico === true.
 */

import { useState } from 'react'
import AutopagoActivarForm from '@/components/AutopagoActivarForm'

interface AutopagoGestionPanelProps {
  subscriptionId: string
  mpPreapprovalStatus: 'authorized' | 'paused' | 'cancelled' | 'pending'
  cardLast4?: string
  montoMensual: number
  descuentoPct?: number
  onUpdated: () => void
}

type PanelView = 'info' | 'cambiar-tarjeta'

export default function AutopagoGestionPanel({
  subscriptionId,
  mpPreapprovalStatus,
  cardLast4,
  montoMensual,
  descuentoPct = 0,
  onUpdated,
}: AutopagoGestionPanelProps) {
  const [view, setView] = useState<PanelView>('info')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function doAction(action: 'pausar' | 'reactivar') {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/subscriptions/${subscriptionId}/autopago`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Error al actualizar')
      }
      onUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  async function doCancelar() {
    if (!confirm('¿Seguro que deseas cancelar el cobro automático? Tu suscripción seguirá activa, pero deberás renovar manualmente.')) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/subscriptions/${subscriptionId}/autopago`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Error al cancelar')
      }
      onUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  if (view === 'cambiar-tarjeta') {
    return (
      <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
        <h3 className="mb-3 font-semibold text-purple-800">Cambiar tarjeta</h3>
        <AutopagoActivarForm
          subscriptionId={subscriptionId}
          montoMensual={montoMensual}
          descuentoPct={descuentoPct}
          actionOverride="cambiar-tarjeta"
          onSuccess={() => { setView('info'); onUpdated() }}
          onCancel={() => setView('info')}
        />
      </div>
    )
  }

  const isPaused = mpPreapprovalStatus === 'paused'
  const statusLabel = isPaused ? 'Pausado' : 'Activo'
  const statusColor = isPaused ? 'text-yellow-600' : 'text-green-600'

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700">Cobro automático</p>
          <p className={`text-sm font-semibold ${statusColor}`}>{statusLabel}</p>
          {cardLast4 && (
            <p className="text-xs text-gray-500">Tarjeta terminada en •••• {cardLast4}</p>
          )}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isPaused ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
          {statusLabel}
        </span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setView('cambiar-tarjeta')}
          disabled={loading}
          className="rounded-md bg-white border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cambiar tarjeta
        </button>

        {isPaused ? (
          <button
            onClick={() => doAction('reactivar')}
            disabled={loading}
            className="rounded-md bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? 'Reactivando…' : 'Reactivar'}
          </button>
        ) : (
          <button
            onClick={() => doAction('pausar')}
            disabled={loading}
            className="rounded-md bg-white border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Pausando…' : 'Pausar'}
          </button>
        )}

        <button
          onClick={doCancelar}
          disabled={loading}
          className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
