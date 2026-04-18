'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'

interface User {
  _id: string
  name: string
  email: string
  role: string
  createdAt: string
}

export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/users').then(r => r.json()).then(data => {
      setUsers(data)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="text-gray-500">Cargando...</div>

  const rolBadge: Record<string, string> = {
    admin: 'bg-red-100 text-red-700',
    alumno: 'bg-blue-100 text-blue-700',
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Usuarios ({users.length})</h1>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Registrado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u._id}>
                <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${rolBadge[u.role] || 'bg-gray-100 text-gray-500'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(u.createdAt).toLocaleDateString('es-CL')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
