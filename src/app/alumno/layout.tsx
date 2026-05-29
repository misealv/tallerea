import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AlumnoNavbar from '@/components/AlumnoNavbar'

export default async function AlumnoLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/alumno/acceso')

  const userName = session.user.name ?? session.user.email ?? 'Alumno'
  const tallerEstado = session.user.tallerEstado ?? null

  return (
    <div className="min-h-screen bg-gray-50">
      <AlumnoNavbar userName={userName} tallerEstado={tallerEstado} />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
