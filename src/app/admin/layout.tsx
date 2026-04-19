import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') redirect('/')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/" className="text-xl font-bold text-purple-700">Tallerea</a>
          <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">Admin</span>
        </div>
        <nav className="flex gap-4 text-sm">
          <a href="/admin" className="text-gray-600 hover:text-purple-700">Dashboard</a>
          <a href="/admin/espacios" className="text-gray-600 hover:text-purple-700">Espacios</a>
          <a href="/admin/usuarios" className="text-gray-600 hover:text-purple-700">Usuarios</a>
          <a href="/admin/finanzas" className="text-gray-600 hover:text-purple-700">Finanzas</a>
          <a href="/admin/liquidaciones" className="text-gray-600 hover:text-purple-700">Liquidaciones</a>
          <a href="/admin/configuracion" className="text-gray-600 hover:text-purple-700">Configuración</a>
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
