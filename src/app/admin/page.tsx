'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'

interface Stats {
  users: number
  accounts: number
  workshops: number
  enrollments: number
  revenue: number
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    fetch('/api/admin/stats').then(r => r.json()).then(setStats)
  }, [])

  if (!stats) return <div className="text-gray-500">Cargando...</div>

  const cards = [
    { label: 'Usuarios', value: stats.users, icon: '👤' },
    { label: 'Espacios', value: stats.accounts, icon: '🏠' },
    { label: 'Talleres activos', value: stats.workshops, icon: '🎨' },
    { label: 'Inscripciones', value: stats.enrollments, icon: '📝' },
    { label: 'Ingresos totales', value: `$${stats.revenue.toLocaleString('es-CL')}`, icon: '💰' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard Admin</h1>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-5 text-center">
            <p className="text-2xl mb-1">{c.icon}</p>
            <p className="text-2xl font-bold text-gray-900">{c.value}</p>
            <p className="text-xs text-gray-500">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
