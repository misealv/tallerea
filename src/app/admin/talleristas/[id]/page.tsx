import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { TallerService } from '@/services/TallerService'
import TalleristaAcciones from './TalleristaAcciones'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const ESTADO_BADGE: Record<string, string> = {
  pendiente:  'bg-yellow-100 text-yellow-800',
  aprobado:   'bg-green-100 text-green-800',
  rechazado:  'bg-red-100 text-red-800',
  suspendido: 'bg-gray-100 text-gray-800',
}

export default async function TalleristaDetallePage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'admin') redirect('/login')

  const user = await TallerService.getById(params.id)
  if (!user || !user.taller) notFound()

  const t = user.taller
  const estado = t.estado ?? 'pendiente'

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-6">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <Link href="/admin/talleristas" className="text-sm text-purple-600 hover:underline">
          ← Volver
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{user.name}</h1>
            <p className="text-gray-500 text-sm">{user.email}</p>
            {t.slug && <p className="text-gray-400 text-xs mt-1">slug: {t.slug}</p>}
          </div>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize ${ESTADO_BADGE[estado] ?? 'bg-gray-100 text-gray-800'}`}>
            {estado}
          </span>
        </div>

        {t.bio && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Bio</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{t.bio}</p>
          </div>
        )}

        {t.credenciales && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Credenciales</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{t.credenciales}</p>
          </div>
        )}

        {t.especialidades && t.especialidades.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Especialidades</p>
            <div className="flex flex-wrap gap-1.5">
              {t.especialidades.map(e => (
                <span key={e} className="bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded-full">{e}</span>
              ))}
            </div>
          </div>
        )}

        {t.entregaMateriales && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Entrega de materiales</p>
            <p className="text-sm text-gray-700">{t.entregaMateriales}</p>
          </div>
        )}

        <div className="flex gap-4 text-xs text-gray-400">
          <span>Intentos: {t.intentos ?? 0}</span>
          <span>Suspensiones: {t.suspensionesCount ?? 0}</span>
          {t.ultimaSolicitudEn && (
            <span>Última solicitud: {new Date(t.ultimaSolicitudEn).toLocaleDateString('es-CL')}</span>
          )}
        </div>
      </div>

      {/* Historial */}
      {t.historial && t.historial.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-3">Historial</h3>
          <ol className="border-l-2 border-gray-100 pl-4 space-y-3">
            {[...t.historial].reverse().map((h, i) => (
              <li key={i} className="text-sm text-gray-600">
                <span className="font-medium text-gray-800 capitalize">{h.accion}</span>
                {' — '}
                {new Date(h.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                {h.razon && <span className="block text-gray-400 text-xs mt-0.5">Razón: {h.razon}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Acciones */}
      <TalleristaAcciones userId={String(user._id)} estado={estado} />
    </div>
  )
}
