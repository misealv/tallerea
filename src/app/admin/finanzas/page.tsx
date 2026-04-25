'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import PaymentBreakdownTable from '@/components/PaymentBreakdownTable'

interface BreakdownSummary {
  ownerId: string
  ownerName: string
  totalBruto: number
  totalFee: number
  totalProfesor: number
  count: number
}

interface RefundFormState {
  breakdownId: string
  motivo: string
  loading: boolean
  msg: string
}

export default function AdminFinanzasPage() {
  const [data, setData] = useState<BreakdownSummary[]>([])
  const [totals, setTotals] = useState({ bruto: 0, fee: 0, profesor: 0, count: 0 })
  const [loading, setLoading] = useState(true)
  const [refund, setRefund] = useState<RefundFormState>({ breakdownId: '', motivo: '', loading: false, msg: '' })
  const [showRefundForm, setShowRefundForm] = useState(false)

  useEffect(() => {
    fetch('/api/admin/finance-summary')
      .then(r => r.json())
      .then(res => {
        setData(res.owners || [])
        setTotals(res.totals || { bruto: 0, fee: 0, profesor: 0, count: 0 })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function handleRefund() {
    if (!refund.breakdownId || !refund.motivo) return
    setRefund(p => ({ ...p, loading: true, msg: '' }))
    const res = await fetch('/api/admin/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ breakdownId: refund.breakdownId, motivo: refund.motivo }),
    })
    const data = await res.json()
    setRefund(p => ({
      ...p,
      loading: false,
      msg: res.ok ? 'Reembolso registrado correctamente' : (data.error || 'Error'),
      breakdownId: res.ok ? '' : p.breakdownId,
      motivo: res.ok ? '' : p.motivo,
    }))
    if (res.ok) setShowRefundForm(false)
  }

  if (loading) return <div className="text-gray-500">Cargando finanzas...</div>

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Finanzas de la plataforma</h1>
        <button onClick={() => setShowRefundForm(v => !v)}
          className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          {showRefundForm ? 'Cerrar' : '↩ Registrar reembolso'}
        </button>
      </div>

      {/* Formulario de reembolso */}
      {showRefundForm && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-orange-900">Registrar reembolso</h2>
          <p className="text-xs text-orange-700">
            Esto crea un nuevo PaymentBreakdown tipo &quot;reembolso&quot; con montos negativos. El original queda intacto. [INMUTABLE]
          </p>
          <input type="text" placeholder="ID del PaymentBreakdown original"
            value={refund.breakdownId}
            onChange={e => setRefund(p => ({ ...p, breakdownId: e.target.value }))}
            className="w-full px-3 py-2 border border-orange-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400" />
          <input type="text" placeholder="Motivo del reembolso (mínimo 5 caracteres)"
            value={refund.motivo}
            onChange={e => setRefund(p => ({ ...p, motivo: e.target.value }))}
            className="w-full px-3 py-2 border border-orange-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400" />
          {refund.msg && (
            <p className={`text-sm ${refund.msg.includes('correctamente') ? 'text-green-700' : 'text-red-600'}`}>
              {refund.msg}
            </p>
          )}
          <button onClick={handleRefund} disabled={refund.loading || !refund.breakdownId || !refund.motivo}
            className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
            {refund.loading ? 'Procesando...' : 'Confirmar reembolso'}
          </button>
        </div>
      )}

      {/* Totales globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <p className="text-2xl font-bold text-gray-900">${totals.bruto.toLocaleString('es-CL')}</p>
          <p className="text-xs text-gray-500">Total recaudado</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <p className="text-2xl font-bold text-purple-600">${totals.fee.toLocaleString('es-CL')}</p>
          <p className="text-xs text-gray-500">Comisión Tallerea</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <p className="text-2xl font-bold text-green-700">${totals.profesor.toLocaleString('es-CL')}</p>
          <p className="text-xs text-gray-500">A profesores</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <p className="text-2xl font-bold text-gray-900">{totals.count}</p>
          <p className="text-xs text-gray-500">Transacciones</p>
        </div>
      </div>

      {/* Desglose por profesor */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Desglose por profesor</h2>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3">Profesor</th>
              <th className="px-4 py-3 text-right">Recaudado</th>
              <th className="px-4 py-3 text-right">Fee Tallerea</th>
              <th className="px-4 py-3 text-right">Profesor</th>
              <th className="px-4 py-3 text-right">Txs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map(row => (
              <tr key={row.ownerId}>
                <td className="px-4 py-3 font-medium text-gray-900">{row.ownerName}</td>
                <td className="px-4 py-3 text-right">${row.totalBruto.toLocaleString('es-CL')}</td>
                <td className="px-4 py-3 text-right text-purple-600">${row.totalFee.toLocaleString('es-CL')}</td>
                <td className="px-4 py-3 text-right text-green-700">${row.totalProfesor.toLocaleString('es-CL')}</td>
                <td className="px-4 py-3 text-right text-gray-500">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Tabla de transacciones completa */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-3">Todas las transacciones</h2>
        <PaymentBreakdownTable showOwner />
      </div>
    </div>
  )
}
