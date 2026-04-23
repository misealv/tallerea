import { TallerService } from '@/services/TallerService'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const ESTADO_BADGE: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  aprobado: 'bg-green-100 text-green-800',
  rechazado: 'bg-red-100 text-red-800',
  suspendido: 'bg-gray-100 text-gray-800',
}

export default async function AdminTalleristasPage() {
  const todos = await TallerService.listar()

  const pendientes = todos.filter(u => u.taller?.estado === 'pendiente')
  const resto = todos.filter(u => u.taller?.estado !== 'pendiente')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Talleristas</h1>
        {pendientes.length > 0 && (
          <span className="bg-yellow-100 text-yellow-800 text-sm font-medium px-3 py-1 rounded-full">
            {pendientes.length} pendiente{pendientes.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {pendientes.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Solicitudes pendientes
          </h2>
          <div className="space-y-2">
            {pendientes.map(u => (
              <Link
                key={String(u._id)}
                href={`/admin/talleristas/${String(u._id)}`}
                className="flex items-center justify-between bg-white border border-yellow-200 rounded-xl px-5 py-4 hover:shadow-sm transition-shadow"
              >
                <div>
                  <p className="font-medium text-gray-900">{u.name}</p>
                  <p className="text-sm text-gray-500">{u.email}</p>
                  <p className="text-xs text-gray-400 mt-1">{u.taller?.especialidades.join(', ')}</p>
                </div>
                <span className="text-xs font-medium bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                  Revisar →
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Todos los talleristas
        </h2>
        {resto.length === 0 && pendientes.length === 0 && (
          <p className="text-gray-500 text-sm">No hay talleristas registrados aún.</p>
        )}
        <div className="space-y-2">
          {resto.map(u => (
            <Link
              key={String(u._id)}
              href={`/admin/talleristas/${String(u._id)}`}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 hover:shadow-sm transition-shadow"
            >
              <div>
                <p className="font-medium text-gray-900">{u.name}</p>
                <p className="text-sm text-gray-500">{u.email}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${ESTADO_BADGE[u.taller?.estado ?? ''] ?? ''}`}>
                {u.taller?.estado}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
