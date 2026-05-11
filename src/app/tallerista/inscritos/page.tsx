import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import dbConnect from '@/lib/db'
import Workshop from '@/models/Workshop'
import Enrollment from '@/models/Enrollment'
import Subscription from '@/models/Subscription'
import { Types } from 'mongoose'
import ReservarClaseModal from './ReservarClaseModal'

export const dynamic = 'force-dynamic'

interface StudentRef { name: string; email: string }
interface WorkshopRef { _id: Types.ObjectId; titulo: string }
interface EnrollmentLean {
  _id: Types.ObjectId
  studentId: StudentRef
  workshopId: WorkshopRef
  estado: string
  monto: number
  esClasePrueba?: boolean
  createdAt: Date
}
interface SubLean {
  _id: Types.ObjectId
  studentId: StudentRef
  workshopId: WorkshopRef
  estado: string
  sesionesUsadas: number
  sesionesTotales: number
  sesionesDisponibles: number
  fechaVencimiento: Date
  monto: number
  createdAt: Date
}

const ESTADO_COLOR: Record<string, string> = {
  pagado:         'bg-green-100 text-green-700',
  pendiente:      'bg-yellow-100 text-yellow-700',
  cancelado:      'bg-gray-100 text-gray-400',
  activa:         'bg-indigo-100 text-indigo-700',
  pendiente_pago: 'bg-amber-100 text-amber-700',
  vencida:        'bg-gray-100 text-gray-400',
  cancelada:      'bg-gray-100 text-gray-400',
}

export default async function InscritosGlobalPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')
  if (session.user.tallerEstado !== 'aprobado') redirect('/tallerista/onboarding')

  await dbConnect()
  const ownerId = session.user.id

  const workshops = await Workshop.find({
    $or: [{ ownerId }, { accountId: ownerId }],
    deletedAt: null,
  }).select('_id titulo').lean<WorkshopRef[]>()

  const workshopIds = workshops.map(w => w._id)

  if (workshopIds.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Inscritos</h1>
        <p className="text-sm text-gray-500">No tienes talleres publicados aún.</p>
      </div>
    )
  }

  const [enrollments, subscriptions] = await Promise.all([
    Enrollment.find({ workshopId: { $in: workshopIds }, activo: true })
      .populate('studentId', 'name email')
      .populate('workshopId', '_id titulo')
      .sort({ createdAt: -1 })
      .lean<EnrollmentLean[]>(),
    Subscription.find({ workshopId: { $in: workshopIds }, activo: true })
      .populate('studentId', 'name email')
      .populate('workshopId', '_id titulo')
      .sort({ createdAt: -1 })
      .lean<SubLean[]>(),
  ])

  const totalPagados = enrollments.filter(e => e.estado === 'pagado').length
  const totalSubs = subscriptions.filter(s => s.estado === 'activa').length
  const totalPendientes = enrollments.filter(e => e.estado === 'pendiente').length
    + subscriptions.filter(s => s.estado === 'pendiente_pago').length

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Inscritos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Todos tus talleres · {totalPagados} inscritos · {totalSubs} suscriptores · {totalPendientes > 0 ? `${totalPendientes} pendientes de pago` : ''}
        </p>
      </div>

      {/* Inscripciones puntuales */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">
            Inscripciones puntuales
            <span className="ml-2 text-sm font-normal text-gray-400">({enrollments.length})</span>
          </h2>
        </div>
        {enrollments.length === 0 ? (
          <p className="text-sm text-gray-400">Sin inscripciones aún.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3">Alumno</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Taller</th>
                  <th className="px-4 py-3">Monto</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map(e => {
                  const student = e.studentId as StudentRef
                  const workshop = e.workshopId as WorkshopRef
                  return (
                    <tr key={String(e._id)} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{student.name}</td>
                      <td className="px-4 py-3 text-gray-500">{student.email}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">
                        {e.esClasePrueba && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded mr-1">Prueba</span>}
                        {workshop.titulo}
                      </td>
                      <td className="px-4 py-3">${e.monto.toLocaleString('es-CL')}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[e.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                          {e.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {new Date(e.createdAt).toLocaleDateString('es-CL')}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/tallerista/talleres/${String(workshop._id)}/inscritos`}
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          Ver taller
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Suscripciones recurrentes */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">
            Suscripciones recurrentes
            <span className="ml-2 text-sm font-normal text-gray-400">({subscriptions.length})</span>
          </h2>
        </div>
        {subscriptions.length === 0 ? (
          <p className="text-sm text-gray-400">Sin suscripciones aún.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3">Alumno</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Taller</th>
                  <th className="px-4 py-3">Sesiones</th>
                  <th className="px-4 py-3">Monto</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Vence</th>
                  <th className="px-4 py-3"></th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map(s => {
                  const student = s.studentId as StudentRef
                  const workshop = s.workshopId as WorkshopRef
                  return (
                    <tr key={String(s._id)} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{student.name}</td>
                      <td className="px-4 py-3 text-gray-500">{student.email}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">{workshop.titulo}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {s.sesionesUsadas}/{s.sesionesTotales}
                      </td>
                      <td className="px-4 py-3">${s.monto.toLocaleString('es-CL')}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[s.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                          {s.estado === 'pendiente_pago' ? 'pendiente pago' : s.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {new Date(s.fechaVencimiento).toLocaleDateString('es-CL')}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/tallerista/talleres/${String(workshop._id)}/inscritos`}
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          Ver taller
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {s.estado === 'activa' && (
                          <ReservarClaseModal
                            subscriptionId={String(s._id)}
                            studentName={student.name}
                            workshopTitle={workshop.titulo}
                            sesionesDisponibles={s.sesionesDisponibles}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
