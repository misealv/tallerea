'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'

interface BreakdownSummary {
  accountId: string
  accountName: string
  totalBruto: number
  totalFee: number
  totalProfesor: number
  count: number
}

export default function AdminFinanzasPage() {
  const [data, setData] = useState<BreakdownSummary[]>([])
  const [totals, setTotals] = useState({ bruto: 0, fee: 0, profesor: 0, count: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/finance-summary')
      .then(r => r.json())
      .then(res => {
        setData(res.accounts || [])
        setTotals(res.totals || { bruto: 0, fee: 0, profesor: 0, count: 0 })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-500">Cargando finanzas...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Finanzas de la plataforma</h1>

      {/* Totales globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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
          <p className="text-xs text-gray-500">Pagado a profesores</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <p className="text-2xl font-bold text-gray-900">{totals.count}</p>
          <p className="text-xs text-gray-500">Transacciones</p>
        </div>
      </div>

      {/* Desglose por espacio */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Desglose por espacio</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3">Espacio</th>
              <th className="px-4 py-3 text-right">Recaudado</th>
              <th className="px-4 py-3 text-right">Fee Tallerea</th>
              <th className="px-4 py-3 text-right">Profesor</th>
              <th className="px-4 py-3 text-right">Txs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map(row => (
              <tr key={row.accountId}>
                <td className="px-4 py-3 font-medium text-gray-900">{row.accountName}</td>
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
  )
}
