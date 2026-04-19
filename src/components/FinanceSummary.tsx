'use client'

import { useState, useEffect, useCallback } from 'react'

interface BreakdownData {
  _id: string
  montoBruto: number
  feeTallerea: number
  montoProfesor: number
  estado: string
  fechaCobro: string
  workshopId: { titulo: string }
  studentId: { name: string }
}

interface LiquidationData {
  _id: string
  totalProfesor: number
  estado: string
  fechaPago?: string
  periodo: { desde: string; hasta: string }
}

interface FinanceSummaryProps {
  accountId: string
}

export default function FinanceSummary({ accountId }: FinanceSummaryProps) {
  const [breakdowns, setBreakdowns] = useState<BreakdownData[]>([])
  const [liquidations, setLiquidations] = useState<LiquidationData[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!accountId) return
    try {
      const [bRes, lRes] = await Promise.all([
        fetch(`/api/admin/breakdowns?accountId=${accountId}&limit=50`),
        fetch(`/api/admin/liquidations?accountId=${accountId}&limit=10`),
      ])
      if (bRes.ok) {
        const bData = await bRes.json()
        setBreakdowns(bData.data || [])
      }
      if (lRes.ok) {
        const lData = await lRes.json()
        setLiquidations(lData.data || [])
      }
    } catch {
      // Silenciar errores si el endpoint aún no existe
    }
    setLoading(false)
  }, [accountId])

  useEffect(() => { fetchData() }, [fetchData])

  // Calcular totales
  const totalBruto = breakdowns.reduce((s, b) => s + b.montoBruto, 0)
  const totalFee = breakdowns.reduce((s, b) => s + b.feeTallerea, 0)
  const totalProfesor = breakdowns.reduce((s, b) => s + b.montoProfesor, 0)
  const cobrados = breakdowns.filter(b => b.estado === 'cobrado')
  const pendienteLiquidar = cobrados.reduce((s, b) => s + b.montoProfesor, 0)

  const estadoBadge: Record<string, string> = {
    pendiente: 'bg-yellow-100 text-yellow-700',
    cobrado: 'bg-blue-100 text-blue-700',
    liquidado: 'bg-green-100 text-green-700',
  }

  if (loading) return <div className="text-gray-500">Cargando finanzas...</div>

  return (
    <div className="space-y-6">
      {/* Resumen rápido */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total recaudado</p>
          <p className="text-2xl font-bold text-gray-900">${totalBruto.toLocaleString('es-CL')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Fee Tallerea</p>
          <p className="text-2xl font-bold text-purple-600">${totalFee.toLocaleString('es-CL')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Tu ganancia</p>
          <p className="text-2xl font-bold text-green-700">${totalProfesor.toLocaleString('es-CL')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Por liquidar</p>
          <p className="text-2xl font-bold text-orange-600">${pendienteLiquidar.toLocaleString('es-CL')}</p>
        </div>
      </div>

      {/* Liquidaciones */}
      {liquidations.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Liquidaciones</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {liquidations.map(l => (
              <div key={l._id} className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(l.periodo.desde).toLocaleDateString('es-CL')} — {new Date(l.periodo.hasta).toLocaleDateString('es-CL')}
                  </p>
                  <p className="text-xs text-gray-500">${l.totalProfesor.toLocaleString('es-CL')}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  l.estado === 'pagada' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {l.estado}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Últimos pagos */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Últimos pagos recibidos</h3>
        </div>
        {breakdowns.length === 0 ? (
          <div className="p-4 text-sm text-gray-400">Sin pagos aún</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {breakdowns.slice(0, 20).map(b => (
              <div key={b._id} className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-900">{b.workshopId?.titulo || 'Taller'}</p>
                  <p className="text-xs text-gray-500">
                    {b.studentId?.name} · {b.fechaCobro
                      ? new Date(b.fechaCobro).toLocaleDateString('es-CL')
                      : 'Pendiente'
                    }
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-green-700">+${b.montoProfesor.toLocaleString('es-CL')}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${estadoBadge[b.estado] || 'bg-gray-100'}`}>
                    {b.estado}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
