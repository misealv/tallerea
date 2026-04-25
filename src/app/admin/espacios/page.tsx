'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'

interface Account {
  _id: string
  nombre: string
  slug: string
  tipo: string
  verificado: boolean
  ownerId: { name: string; email: string }
  createdAt: string
}

export default function AdminEspaciosPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAccounts = () => {
    fetch('/api/admin/accounts').then(r => r.json()).then(data => {
      setAccounts(data)
      setLoading(false)
    })
  }

  useEffect(() => { fetchAccounts() }, [])

  const toggleVerificado = async (accountId: string, verificado: boolean) => {
    await fetch('/api/admin/accounts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, verificado }),
    })
    fetchAccounts()
  }

  if (loading) return <div className="text-gray-500">Cargando...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Espacios ({accounts.length})</h1>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Dueño</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Creado</th>
              <th className="px-4 py-3">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {accounts.map((a) => (
              <tr key={a._id}>
                <td className="px-4 py-3 font-medium text-gray-900">{a.nombre}</td>
                <td className="px-4 py-3 text-gray-500 capitalize">{a.tipo}</td>
                <td className="px-4 py-3 text-gray-500">{a.ownerId?.email || '—'}</td>
                <td className="px-4 py-3">
                  {a.verificado
                    ? <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Verificado</span>
                    : <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">Pendiente</span>}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(a.createdAt).toLocaleDateString('es-CL')}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleVerificado(a._id, !a.verificado)}
                    className={`text-xs px-3 py-1 rounded ${a.verificado ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
                  >
                    {a.verificado ? 'Quitar verificación' : 'Verificar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
