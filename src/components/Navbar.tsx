'use client'

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { useState } from 'react'

export default function Navbar() {
  const { data: session } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-purple-700">Tallerea</Link>

        <div className="hidden md:flex items-center gap-6">
          <Link href="/talleres" className="text-gray-600 hover:text-purple-700 text-sm font-medium">
            Buscar talleres
          </Link>
          {session ? (
            <>
              <Link href="/dashboard" className="text-gray-600 hover:text-purple-700 text-sm font-medium">
                Mi espacio
              </Link>
              <Link href="/mis-talleres" className="text-gray-600 hover:text-purple-700 text-sm font-medium">
                Mis inscripciones
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-sm text-gray-500 hover:text-red-600"
              >
                Salir
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm text-gray-600 hover:text-purple-700 font-medium">
                Iniciar sesión
              </Link>
              <Link
                href="/registro"
                className="text-sm bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
              >
                Registrarse
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2" aria-label="Menú">
          <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 pb-4 space-y-2">
          <Link href="/talleres" className="block py-2 text-gray-700" onClick={() => setMenuOpen(false)}>
            Buscar talleres
          </Link>
          {session ? (
            <>
              <Link href="/dashboard" className="block py-2 text-gray-700" onClick={() => setMenuOpen(false)}>
                Mi espacio
              </Link>
              <Link href="/mis-talleres" className="block py-2 text-gray-700" onClick={() => setMenuOpen(false)}>
                Mis inscripciones
              </Link>
              <button onClick={() => signOut({ callbackUrl: '/' })} className="block py-2 text-red-600">
                Salir
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="block py-2 text-gray-700" onClick={() => setMenuOpen(false)}>
                Iniciar sesión
              </Link>
              <Link href="/registro" className="block py-2 text-purple-700 font-medium" onClick={() => setMenuOpen(false)}>
                Registrarse
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  )
}
