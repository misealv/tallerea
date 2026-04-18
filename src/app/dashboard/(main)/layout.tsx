import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AccountService } from '@/services/AccountService'
import DashboardShell from '@/components/DashboardShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const account = await AccountService.getByOwnerId(session.user.id)

  // Si no tiene espacio, redirigir a crear uno
  if (!account) redirect('/dashboard/crear-espacio')

  return (
    <DashboardShell
      accountName={account.nombre}
      accountSlug={account.slug}
      accountId={account._id!.toString()}
    >
      {children}
    </DashboardShell>
  )
}
