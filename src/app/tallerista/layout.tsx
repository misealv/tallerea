import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'

export default async function TalleristaLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const tallerEstado = session.user.tallerEstado

  // Sin taller o pendiente → solo puede acceder a /onboarding
  if (!tallerEstado || tallerEstado === 'pendiente') {
    // Permitir que el componente de onboarding se renderice
    return (
      <div className="min-h-screen bg-gray-50">
        {children}
      </div>
    )
  }

  if (tallerEstado === 'rechazado' || tallerEstado === 'suspendido') {
    // Solo acceso a onboarding para re-postular
    return (
      <div className="min-h-screen bg-gray-50">
        {children}
      </div>
    )
  }

  // tallerEstado === 'aprobado'
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xl font-bold text-purple-700">Tallerea</Link>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">
            Tallerista
          </span>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/tallerista" className="text-gray-600 hover:text-purple-700">Dashboard</Link>
          <Link href="/tallerista/talleres" className="text-gray-600 hover:text-purple-700">Mis talleres</Link>
          <Link href="/tallerista/talleres/nuevo" className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">+ Nuevo taller</Link>
          <Link href="/tallerista/reagendamientos" className="text-gray-600 hover:text-purple-700">Reagendamientos</Link>
          <Link href="/tallerista/finanzas" className="text-gray-600 hover:text-purple-700">Finanzas</Link>
          <Link href="/tallerista/liquidaciones" className="text-gray-600 hover:text-purple-700">Liquidaciones</Link>
          <Link href="/tallerista/perfil" className="text-gray-600 hover:text-purple-700">Mi perfil</Link>
        </nav>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
