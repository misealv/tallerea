import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { AccountService } from '@/services/AccountService'
import { WorkshopService } from '@/services/WorkshopService'
import { LocationService } from '@/services/LocationService'
import { EnrollmentService } from '@/services/EnrollmentService'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const account = await AccountService.getByOwnerId(session!.user.id)
  if (!account) return null

  const accountId = account._id!.toString()
  const [workshops, locations] = await Promise.all([
    WorkshopService.getByAccountId(accountId, 1, 100),
    LocationService.getByAccountId(accountId, 1, 100),
  ])

  // Contar inscripciones totales de todos los talleres
  let totalEnrollments = 0
  for (const w of workshops.data) {
    const enrollments = await EnrollmentService.getByWorkshopId(w._id!.toString(), 1, 1)
    totalEnrollments += enrollments.total
  }

  const stats = [
    { label: 'Talleres activos', value: workshops.total, icon: '🎨', href: '/dashboard/talleres' },
    { label: 'Ubicaciones', value: locations.total, icon: '📍', href: '/dashboard/ubicaciones' },
    { label: 'Inscripciones', value: totalEnrollments, icon: '👥', href: '/dashboard/inscripciones' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Resumen</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition"
          >
            <div className="text-3xl mb-2">{s.icon}</div>
            <div className="text-3xl font-bold text-gray-900">{s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </Link>
        ))}
      </div>

      {workshops.total === 0 && (
        <div className="bg-purple-50 rounded-xl p-8 text-center">
          <p className="text-lg text-purple-800 font-medium mb-2">¡Bienvenido a Tallerea!</p>
          <p className="text-purple-600 mb-4">Empieza publicando tu primer taller.</p>
          <Link
            href="/dashboard/talleres/nuevo"
            className="inline-block bg-purple-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-purple-700 transition"
          >
            Crear taller
          </Link>
        </div>
      )}

      {workshops.total > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="font-semibold text-gray-900">Últimos talleres</h2>
            <Link href="/dashboard/talleres" className="text-sm text-purple-600 hover:underline">
              Ver todos
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {workshops.data.slice(0, 5).map((w) => (
              <div key={w._id!.toString()} className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-medium text-gray-900">{w.titulo}</p>
                  <p className="text-sm text-gray-500">
                    {w.cupoDisponible}/{w.cupoMax} cupos · ${w.precio.toLocaleString('es-CL')}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  w.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {w.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
