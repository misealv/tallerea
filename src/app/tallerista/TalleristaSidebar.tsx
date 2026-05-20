'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'

const navItems = [
  { href: '/tallerista',              label: 'Dashboard',       icon: '📊', exact: true },
  { href: '/tallerista/talleres',     label: 'Mis talleres',    icon: '🎨' },
  { href: '/tallerista/inscritos',    label: 'Inscritos',       icon: '👥' },
  { href: '/tallerista/calendario',   label: 'Calendario',      icon: '📅' },
  { href: '/tallerista/reagendamientos', label: 'Reagendamientos', icon: '🔄' },
  { href: '/tallerista/finanzas',     label: 'Finanzas',        icon: '💰' },
  { href: '/tallerista/liquidaciones',label: 'Liquidaciones',   icon: '🏦' },
  { href: '/tallerista/espacios',     label: 'Mis espacios',    icon: '📍' },
  { href: '/tallerista/perfil',       label: 'Mi perfil',       icon: '👤' },
  { href: '/cuenta/cambiar-clave',    label: 'Cambiar clave',   icon: '🔑' },
]

interface Props {
  userName: string
}

export default function TalleristaSidebar({ userName }: Props) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Cerrar drawer al navegar
  useEffect(() => { setOpen(false) }, [pathname])

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-5 border-b border-gray-100">
        <Link href="/" className="text-xl font-bold text-purple-700">Tallerea</Link>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">Tallerista</span>
        </div>
        <p className="text-xs text-gray-500 mt-1 truncate">{userName}</p>
      </div>

      {/* Nuevo taller CTA */}
      <div className="px-3 pt-4 pb-2">
        <Link
          href="/tallerista/talleres/nuevo"
          className="flex items-center justify-center gap-2 w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <span>+</span> Nuevo taller
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {navItems.map(item => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-purple-50 text-purple-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-gray-100">
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <span className="text-base">🚪</span>
          Salir
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Botón hamburguesa — solo móvil */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 bg-white border border-gray-200 rounded-lg p-2 shadow-sm"
        aria-label="Abrir menú"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Overlay — solo móvil cuando está abierto */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer móvil */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col
        transform transition-transform duration-200 ease-in-out
        md:hidden
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="Cerrar menú"
        >
          ✕
        </button>
        {sidebarContent}
      </aside>

      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-60 bg-white border-r border-gray-200 flex-col min-h-screen shrink-0">
        {sidebarContent}
      </aside>
    </>
  )
}
