import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import TalleristaSidebar from './TalleristaSidebar'

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
    <div className="min-h-screen flex bg-gray-50">
      <TalleristaSidebar userName={session.user.name ?? session.user.email ?? ''} />
      <main className="flex-1 pt-16 md:pt-6 px-4 pb-6 md:px-8 overflow-auto min-w-0">{children}</main>
    </div>
  )
}
