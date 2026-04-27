import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AlumnoLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/alumno/acceso')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar del área alumno */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/alumno" className="font-bold text-purple-700 text-lg">
            Mis talleres
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/alumno" className="text-gray-600 hover:text-purple-700">
              Inicio
            </Link>
            <Link href="/alumno/historial" className="text-gray-600 hover:text-purple-700">
              Historial
            </Link>
            <Link href="/alumno/credito" className="text-gray-600 hover:text-purple-700">
              Crédito
            </Link>
            <Link href="/alumno/reviews" className="text-gray-600 hover:text-purple-700">
              Reseñas
            </Link>
            <Link href="/alumno/dependientes" className="text-gray-600 hover:text-purple-700">
              Dependientes
            </Link>
            <Link href="/talleres" className="text-gray-600 hover:text-purple-700">
              Explorar
            </Link>
            <Link
              href="/api/auth/signout?callbackUrl=/"
              className="text-gray-400 hover:text-red-500"
            >
              Salir
            </Link>
          </div>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
