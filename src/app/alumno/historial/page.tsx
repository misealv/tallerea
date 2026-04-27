import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import dbConnect from '@/lib/db'
import Enrollment from '@/models/Enrollment'
import Subscription from '@/models/Subscription'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

interface WorkshopRef { titulo: string; slug: string }

interface EnrollmentLean {
  _id: Types.ObjectId
  workshopId: WorkshopRef | null
  estado: string
  monto: number
  createdAt: Date
}

interface SubscriptionLean {
  _id: Types.ObjectId
  workshopId: WorkshopRef | null
  estado: string
  sesionesUsadas: number
  sesionesTotales: number
  fechaVencimiento: Date
  monto: number
  createdAt: Date
}

const ESTADO_LABEL: Record<string, string> = {
  pagado: 'Pagado',
  pendiente: 'Pendiente',
  cancelado: 'Cancelado',
  activa: 'Activa',
  vencida: 'Vencida',
}

const ESTADO_COLOR: Record<string, string> = {
  pagado: 'bg-green-100 text-green-700',
  pendiente: 'bg-yellow-100 text-yellow-700',
  cancelado: 'bg-gray-100 text-gray-500',
  activa: 'bg-indigo-100 text-indigo-700',
  vencida: 'bg-gray-100 text-gray-500',
}

export default async function HistorialPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/alumno/acceso')

  await dbConnect()
  const studentId = session.user.id

  const [enrollmentsRaw, subscriptionsRaw] = await Promise.all([
    Enrollment.find({ studentId, activo: true })
      .populate('workshopId', 'titulo slug')
      .sort({ createdAt: -1 })
      .lean<EnrollmentLean[]>(),
    Subscription.find({ studentId, activo: true })
      .populate('workshopId', 'titulo slug')
      .sort({ createdAt: -1 })
      .lean<SubscriptionLean[]>(),
  ])

  // Filtrar items cuyo workshop fue eliminado (populate devuelve null)
  const enrollments = enrollmentsRaw.filter(e => e.workshopId !== null)
  const subscriptions = subscriptionsRaw.filter(s => s.workshopId !== null)

  return (
    <div className="space-y-10 max-w-2xl">
      <div>
        <Link href="/alumno" className="text-sm text-indigo-600 hover:underline">← Volver</Link>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">Historial</h1>
      </div>

      {/* Suscripciones */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Suscripciones</h2>
        {subscriptions.length === 0 ? (
          <p className="text-sm text-gray-400">Sin suscripciones registradas.</p>
        ) : (
          <div className="space-y-3">
            {subscriptions.map(s => {
              const w = s.workshopId as WorkshopRef
              return (
              <div key={String(s._id)} className="bg-white border border-gray-200 rounded-xl px-5 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <Link href={`/talleres/${w.slug}`} className="font-medium text-gray-900 text-sm hover:underline">
                      {w.titulo}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {s.sesionesUsadas} / {s.sesionesTotales} sesiones usadas
                      {s.fechaVencimiento && (
                        <> · Vence {new Date(s.fechaVencimiento).toLocaleDateString('es-CL')}</>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      ${(s.monto ?? 0).toLocaleString('es-CL')} / mes · Desde {new Date(s.createdAt).toLocaleDateString('es-CL')}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ESTADO_COLOR[s.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                    {ESTADO_LABEL[s.estado] ?? s.estado}
                  </span>
                </div>
              </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Inscripciones puntuales */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Clases puntuales</h2>
        {enrollments.length === 0 ? (
          <p className="text-sm text-gray-400">Sin inscripciones registradas.</p>
        ) : (
          <div className="space-y-3">
            {enrollments.map(e => {
              const w = e.workshopId as WorkshopRef
              return (
              <div key={String(e._id)} className="bg-white border border-gray-200 rounded-xl px-5 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <Link href={`/talleres/${w.slug}`} className="font-medium text-gray-900 text-sm hover:underline">
                      {w.titulo}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5">
                      ${(e.monto ?? 0).toLocaleString('es-CL')} · {new Date(e.createdAt).toLocaleDateString('es-CL')}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ESTADO_COLOR[e.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                    {ESTADO_LABEL[e.estado] ?? e.estado}
                  </span>
                </div>
              </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
