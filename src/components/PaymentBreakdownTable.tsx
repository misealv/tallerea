'use client'

import { useState, useEffect, useCallback } from 'react'

interface Breakdown {
  _id: string
  workshopId?: { titulo?: string; slug?: string }
  studentId?: { name?: string; email?: string }
  ownerId?: { name?: string; email?: string }
  montoBruto: number
  feeTallerea: number
  montoProfesor: number
  comisionMP: number
  tipo: 'pago' | 'reembolso' | 'ajuste'
  estado: 'pendiente' | 'cobrado' | 'liquidado' | 'reembolsado'
  // [INMUTABLE] Campo calculado por la API: true si el breakdown aparece en Liquidation.breakdowns[]
  isLiquidated?: boolean
  createdAt: string
}

interface Props {
  ownerId?: string
  showOwner?: boolean
}

const TIPO_BADGE: Record<string, string> = {
  pago: 'bg-green-100 text-green-700',
  reembolso: 'bg-red-100 text-red-600',
  ajuste: 'bg-yellow-100 text-yellow-700',
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente: 'bg-gray-100 text-gray-600',
  cobrado: 'bg-blue-100 text-blue-700',
  liquidado: 'bg-purple-100 text-purple-700',
  reembolsado: 'bg-orange-100 text-orange-600',
}

export default function PaymentBreakdownTable({ ownerId, showOwner = false }: Props) {
  const [data, setData] = useState<Breakdown[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [tipo, setTipo] = useState('')
  const LIMIT = 20

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
    if (ownerId) params.set('ownerId', ownerId)
    if (tipo) params.set('tipo', tipo)
    const res = await fetch(`/api/admin/breakdowns?${params}`)
    if (res.ok) {
      const json = await res.json()
      setData(json.data || [])
      setTotal(json.total || 0)
    }
    setLoading(false)
  }, [ownerId, page, tipo])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex gap-3 items-center">
        <select value={tipo} onChange={e => { setTipo(e.target.value); setPage(1) }}
          className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg">
          <option value="">Todos los tipos</option>
          <option value="pago">Pago</option>
          <option value="reembolso">Reembolso</option>
          <option value="ajuste">Ajuste</option>
        </select>
        <span className="text-xs text-gray-400">{total} registros</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Tabla — desktop */}
        <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              {showOwner && <th className="px-4 py-3">Profesor</th>}
              <th className="px-4 py-3">Taller</th>
              <th className="px-4 py-3">Alumno</th>
              <th className="px-4 py-3 text-right">Bruto</th>
              <th className="px-4 py-3 text-right">Fee</th>
              <th className="px-4 py-3 text-right">Profesor</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={showOwner ? 9 : 8} className="px-4 py-6 text-center text-gray-400">Cargando...</td></tr>
            )}
            {!loading && data.length === 0 && (
              <tr><td colSpan={showOwner ? 9 : 8} className="px-4 py-6 text-center text-gray-400">Sin transacciones</td></tr>
            )}
            {!loading && data.map(b => (
              <tr key={b._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                  {new Date(b.createdAt).toLocaleDateString('es-CL')}
                </td>
                {showOwner && (
                  <td className="px-4 py-3 text-gray-700 text-xs">{b.ownerId?.name || '—'}</td>
                )}
                <td className="px-4 py-3 text-gray-700 text-xs max-w-[140px] truncate">
                  {b.workshopId?.titulo || '—'}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{b.studentId?.name || '—'}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  ${b.montoBruto.toLocaleString('es-CL')}
                </td>
                <td className="px-4 py-3 text-right text-purple-600">
                  ${b.feeTallerea.toLocaleString('es-CL')}
                </td>
                <td className="px-4 py-3 text-right text-green-700 font-medium">
                  ${b.montoProfesor.toLocaleString('es-CL')}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${TIPO_BADGE[b.tipo] || ''}`}>{b.tipo}</span>
                </td>
                <td className="px-4 py-3">
                  {/* [INMUTABLE] isLiquidated viene de la API (cruce con Liquidation.breakdowns[]) */}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${b.isLiquidated ? ESTADO_BADGE.liquidado : ESTADO_BADGE[b.estado] || ''}`}>
                    {b.isLiquidated ? 'liquidado' : b.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {/* Cards — móvil */}
        <div className="md:hidden">
          {loading && <p className="px-4 py-6 text-center text-gray-400 text-sm">Cargando...</p>}
          {!loading && data.length === 0 && <p className="px-4 py-6 text-center text-gray-400 text-sm">Sin transacciones</p>}
          {!loading && (
            <div className="divide-y divide-gray-100">
              {data.map(b => (
                <div key={b._id} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{b.workshopId?.titulo || '—'}</p>
                      <p className="text-xs text-gray-500 truncate">{b.studentId?.name || '—'}{showOwner && b.ownerId?.name ? ` · ${b.ownerId.name}` : ''}</p>
                    </div>
                    <p className="text-sm font-bold text-green-700 shrink-0">${b.montoProfesor.toLocaleString('es-CL')}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-gray-400">{new Date(b.createdAt).toLocaleDateString('es-CL')}</span>
                    <span className="text-gray-500">Bruto ${b.montoBruto.toLocaleString('es-CL')} · Fee ${b.feeTallerea.toLocaleString('es-CL')}</span>
                    <span className={`px-1.5 py-0.5 rounded-full ${TIPO_BADGE[b.tipo] || ''}`}>{b.tipo}</span>
                    <span className={`px-1.5 py-0.5 rounded-full ${b.isLiquidated ? ESTADO_BADGE.liquidado : ESTADO_BADGE[b.estado] || ''}`}>
                      {b.isLiquidated ? 'liquidado' : b.estado}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex gap-2 justify-end text-sm">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1 border rounded-lg disabled:opacity-40">←</button>
          <span className="px-3 py-1 text-gray-500">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-3 py-1 border rounded-lg disabled:opacity-40">→</button>
        </div>
      )}
    </div>
  )
}
