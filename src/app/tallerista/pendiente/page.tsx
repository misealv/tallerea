import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PendienteClient from './PendienteClient'

export const dynamic = 'force-dynamic'

export default async function TalleristaPendientePage({
  searchParams,
}: {
  searchParams: { nuevo?: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  // Si ya está aprobado, mandarlo al dashboard
  if (session.user.tallerEstado === 'aprobado') {
    redirect('/tallerista')
  }

  // Si fue rechazado, mandarlo a re-postular
  if (session.user.tallerEstado === 'rechazado') {
    redirect('/tallerista/onboarding')
  }

  const recienEnviado = searchParams.nuevo === '1'

  return <PendienteClient recienEnviado={recienEnviado} />
}
