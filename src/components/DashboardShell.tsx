'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

const navItems = [
  { href: '/dashboard', label: 'Resumen', icon: '📊' },
  { href: '/dashboard/talleres', label: 'Talleres', icon: '🎨' },
  { href: '/dashboard/ubicaciones', label: 'Ubicaciones', icon: '📍' },
  { href: '/dashboard/inscripciones', label: 'Inscripciones', icon: '👥' },
  { href: '/dashboard/equipo', label: 'Equipo', icon: '🤝' },
]

interface Props {
  accountName: string
  accountSlug: string
  accountId: string
  children: React.ReactNode
}

export default function DashboardShell({ accountName, accountId, children }: Props) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-5 border-b border-gray-100">
          <Link href="/" className="text-xl font-bold text-purple-600">Tallerea</Link>
          <p className="text-sm text-gray-500 mt-1 truncate">{accountName}</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  isActive
                    ? 'bg-purple-50 text-purple-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-gray-100">
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50 transition"
          >
            🚪 Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8">
        <input type="hidden" id="accountId" value={accountId} />
        {children}
      </main>
    </div>
  )
}
