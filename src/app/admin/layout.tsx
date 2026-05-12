import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') redirect('/')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/" className="text-xl font-bold text-purple-700">Tallerea</Link>
          <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">Admin</span>
        </div>
        <nav className="flex gap-2 text-sm overflow-x-auto scrollbar-none">
          <Link href="/admin" className="text-gray-600 hover:text-purple-700 whitespace-nowrap px-2 py-1 rounded hover:bg-purple-50">Dashboard</Link>
          <Link href="/admin/espacios" className="text-gray-600 hover:text-purple-700 whitespace-nowrap px-2 py-1 rounded hover:bg-purple-50">Espacios</Link>
          <Link href="/admin/usuarios" className="text-gray-600 hover:text-purple-700 whitespace-nowrap px-2 py-1 rounded hover:bg-purple-50">Usuarios</Link>
          <Link href="/admin/finanzas" className="text-gray-600 hover:text-purple-700 whitespace-nowrap px-2 py-1 rounded hover:bg-purple-50">Finanzas</Link>
          <Link href="/admin/liquidaciones" className="text-gray-600 hover:text-purple-700 whitespace-nowrap px-2 py-1 rounded hover:bg-purple-50">Liquidaciones</Link>
          <Link href="/admin/talleristas" className="text-gray-600 hover:text-purple-700 whitespace-nowrap px-2 py-1 rounded hover:bg-purple-50">Talleristas</Link>
          <Link href="/admin/configuracion" className="text-gray-600 hover:text-purple-700 whitespace-nowrap px-2 py-1 rounded hover:bg-purple-50">Configuración</Link>
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
