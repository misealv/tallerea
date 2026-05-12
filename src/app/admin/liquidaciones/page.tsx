'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'

interface Liquidation {
  _id: string
  accountId: { _id: string; nombre: string }
  totalBruto: number
  totalFeeTallerea: number
  totalProfesor: number
  cantidadPagos: number
  estado: string
  periodo: { desde: string; hasta: string }
  fechaPago?: string
}

interface Account {
  _id: string
  nombre: string
}

export default function AdminLiquidacionesPage() {
  const [liquidations, setLiquidations] = useState<Liquidation[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    const [lRes, aRes] = await Promise.all([
      fetch('/api/admin/liquidations?limit=50'),
      fetch('/api/admin/accounts'),
    ])
    if (lRes.ok) {
      const lData = await lRes.json()
      setLiquidations(lData.data || [])
    }
    if (aRes.ok) {
      const aData = await aRes.json()
      setAccounts(aData || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleGenerate() {
    if (!selectedAccount || !desde || !hasta) {
      setError('Selecciona espacio y período')
      return
    }
    setGenerating(true)
    setError('')
    const res = await fetch('/api/admin/liquidations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: selectedAccount, desde, hasta }),
    })
    setGenerating(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Error al generar')
      return
    }
    fetchData()
  }

  async function handleMarkPaid(id: string) {
    if (!confirm('¿Marcar esta liquidación como pagada?')) return
    await fetch(`/api/admin/liquidations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    fetchData()
  }

  async function handleExportCsv() {
    const pendientes = liquidations.filter(l => l.estado === 'pendiente').map(l => l._id)
    if (pendientes.length === 0) {
      setError('No hay liquidaciones pendientes para exportar')
      return
    }
    const res = await fetch('/api/admin/liquidations/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ liquidationIds: pendientes }),
    })
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `liquidaciones_${Date.now()}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } else {
      const data = await res.json()
      setError(data.error || 'Error al exportar')
    }
  }

  const estadoBadge: Record<string, string> = {
    pendiente: 'bg-yellow-100 text-yellow-700',
    procesando: 'bg-blue-100 text-blue-700',
    pagada: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-600',
  }

  if (loading) return <div className="text-gray-500">Cargando liquidaciones...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Liquidaciones</h1>
        <button onClick={handleExportCsv}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
          📥 Exportar CSV bancario
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}

      {/* Generar nueva liquidación */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Generar liquidación</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">Seleccionar espacio</option>
            {accounts.map(a => <option key={a._id} value={a._id}>{a.nombre}</option>)}
          </select>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Desde" />
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Hasta" />
          <button onClick={handleGenerate} disabled={generating}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
            {generating ? 'Generando...' : 'Generar'}
          </button>
        </div>
      </div>

      {/* Lista de liquidaciones */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Tabla — desktop */}
        <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3">Espacio</th>
              <th className="px-4 py-3">Período</th>
              <th className="px-4 py-3 text-right">Profesor</th>
              <th className="px-4 py-3 text-right">Pagos</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {liquidations.map(l => (
              <tr key={l._id}>
                <td className="px-4 py-3 font-medium text-gray-900">{l.accountId?.nombre || '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(l.periodo.desde).toLocaleDateString('es-CL')} — {new Date(l.periodo.hasta).toLocaleDateString('es-CL')}
                </td>
                <td className="px-4 py-3 text-right font-medium text-green-700">
                  ${l.totalProfesor.toLocaleString('es-CL')}
                </td>
                <td className="px-4 py-3 text-right text-gray-500">{l.cantidadPagos}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${estadoBadge[l.estado] || 'bg-gray-100'}`}>
                    {l.estado}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {l.estado === 'pendiente' && (
                    <button onClick={() => handleMarkPaid(l._id)}
                      className="text-xs text-green-600 hover:underline">
                      Marcar pagada
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {/* Cards — móvil */}
        <div className="md:hidden divide-y divide-gray-100">
          {liquidations.map(l => (
            <div key={l._id} className="px-4 py-3 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-gray-900 text-sm">{l.accountId?.nombre || '—'}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${estadoBadge[l.estado] || 'bg-gray-100'}`}>{l.estado}</span>
              </div>
              <p className="text-xs text-gray-500">
                {new Date(l.periodo.desde).toLocaleDateString('es-CL')} — {new Date(l.periodo.hasta).toLocaleDateString('es-CL')}
              </p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-green-700 font-semibold">${l.totalProfesor.toLocaleString('es-CL')} · {l.cantidadPagos} pagos</span>
                {l.estado === 'pendiente' && (
                  <button onClick={() => handleMarkPaid(l._id)} className="text-green-600 hover:underline">
                    Marcar pagada
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
