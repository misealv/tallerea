'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { usePathname } from 'next/navigation'

interface AlumnoNavbarProps {
  userName: string
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0].toUpperCase())
    .join('')
}

const LINKS = [
  { href: '/talleres',            label: 'Explorar' },
  { href: '/alumno/historial',    label: 'Mis talleres' },
  { href: '/alumno/credito',      label: 'Saldo' },
  { href: '/alumno/reviews',      label: 'Reseñas' },
  { href: '/alumno/dependientes', label: 'Dependientes' },
]

export default function AlumnoNavbar({ userName }: AlumnoNavbarProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Cerrar drawer al navegar (incluye mismo path con query params distintos)
  useEffect(() => { setOpen(false) }, [pathname])

  const initials = getInitials(userName || 'A')

  // /alumno exacto para el link de Inicio; resto por prefix
  const isActive = (href: string) =>
    href === '/alumno' ? pathname === '/alumno' : pathname.startsWith(href)

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">

        {/* Logo */}
        <Link href="/alumno" className="flex items-center gap-2 shrink-0">
          <span className="font-bold text-purple-700 text-lg">Tallerea</span>
          <span className="hidden sm:inline-block text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
            Alumno
          </span>
        </Link>

        {/* Links de escritorio (≥640px) */}
        <div className="hidden sm:flex items-center gap-0.5">
          {LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive(l.href)
                  ? 'bg-purple-50 text-purple-700 font-semibold'
                  : 'text-gray-600 hover:text-purple-700 hover:bg-gray-50'
              }`}
            >
              {l.label}
            </Link>
          ))}

          {/* Círculo de iniciales — click para salir */}
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            title={`Salir (${userName})`}
            aria-label={`Salir de la sesión de ${userName}`}
            className="ml-2 w-9 h-9 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center hover:bg-purple-700 active:scale-95 transition-all shrink-0"
          >
            {initials}
          </button>
        </div>

        {/* Mobile: iniciales + hamburguesa */}
        <div className="flex sm:hidden items-center gap-2">
          <div
            className="w-9 h-9 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center shrink-0"
            aria-label={userName}
          >
            {initials}
          </div>
          <button
            onClick={() => setOpen(o => !o)}
            className="w-11 h-11 flex items-center justify-center text-gray-600 hover:text-purple-700 rounded-lg"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
          >
            {open ? (
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Drawer mobile */}
      {open && (
        <div className="sm:hidden bg-white border-t border-gray-100 px-4 pt-2 pb-4 space-y-1">
          <p className="text-xs text-gray-400 px-3 py-2">Hola, {userName}</p>
          {LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`flex items-center px-3 py-3 rounded-lg text-sm transition-colors min-h-[44px] ${
                isActive(l.href)
                  ? 'bg-purple-50 text-purple-700 font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {l.label}
            </Link>
          ))}
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex items-center w-full text-left px-3 py-3 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors min-h-[44px]"
          >
            Salir
          </button>
        </div>
      )}
    </nav>
  )
}
