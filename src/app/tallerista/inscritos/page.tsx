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
import EditarSuscripcionModal from './EditarSuscripcionModal'
import ConfirmarPagoModal from './ConfirmarPagoModal'
import RenovarExternoModal from './RenovarExternoModal'
import { getSubViewInfo } from '@/lib/subscriptionView'

export const dynamic = 'force-dynamic'

interface StudentRef { _id: Types.ObjectId; name: string; email: string }
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
  precioSnapshot?: number
  precioEspecial?: boolean
  notaPrecioEspecial?: string
  autoRenovar?: boolean
  createdAt: Date
  dependentNombreSnapshot?: string
  clasesPrepagadas?: { cantidad: number; consumidas: number; caducaEn?: Date }
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
      .populate('studentId', '_id name email')
      .populate('workshopId', '_id titulo')
      .sort({ createdAt: -1 })
      .lean<EnrollmentLean[]>(),
    Subscription.find({ workshopId: { $in: workshopIds }, activo: true })
      .populate('studentId', '_id name email')
      .populate('workshopId', '_id titulo')
      .select('studentId workshopId estado sesionesUsadas sesionesTotales sesionesDisponibles fechaVencimiento monto precioSnapshot precioEspecial notaPrecioEspecial createdAt dependentNombreSnapshot clasesPrepagadas')
      .sort({ createdAt: -1 })
      .lean<SubLean[]>(),
  ])

  // Subs activas/pendientes primero, vencidas/canceladas al fondo
  const estadoOrder: Record<string, number> = { activa: 0, pendiente_pago: 1, vencida: 2, cancelada: 3 }
  subscriptions.sort((a, b) => (estadoOrder[a.estado] ?? 9) - (estadoOrder[b.estado] ?? 9)
    || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const totalPagados = enrollments.filter(e => e.estado === 'pagado').length
  const totalSubs = subscriptions.filter(s => s.estado === 'activa').length
  const totalPendientes = enrollments.filter(e => e.estado === 'pendiente').length
    + subscriptions.filter(s => s.estado === 'pendiente_pago').length

  return (
    <div className="space-y-8">
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
          <>
            {/* Tabla — solo desktop */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3">Alumno</th>
                    <th className="px-4 py-3">Taller</th>
                    <th className="px-4 py-3">Monto</th>
                    <th className="px-4 py-3">Estado · Fecha</th>
                    <th className="px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map(e => {
                    const student = e.studentId as StudentRef
                    const workshop = e.workshopId as WorkshopRef
                    return (
                      <tr key={String(e._id)} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800 text-sm">{student.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{student.email}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-[220px] truncate">
                          {e.esClasePrueba && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded mr-1">Prueba</span>}
                          {workshop.titulo}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800">${e.monto.toLocaleString('es-CL')}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[e.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                            {e.estado}
                          </span>
                          <p className="text-xs text-gray-400 mt-1">{new Date(e.createdAt).toLocaleDateString('es-CL')}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Link href={`/tallerista/talleres/${String(workshop._id)}/inscritos`} className="text-xs text-indigo-600 hover:underline">Ver taller</Link>
                            <Link href={`/tallerista/inscritos/${String(student._id)}/reservas`} className="text-xs text-gray-500 hover:underline">Reservas</Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Cards — solo móvil */}
            <div className="md:hidden space-y-3">
              {enrollments.map(e => {
                const student = e.studentId as StudentRef
                const workshop = e.workshopId as WorkshopRef
                return (
                  <div key={String(e._id)} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{student.name}</p>
                        <p className="text-xs text-gray-500">{student.email}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${ESTADO_COLOR[e.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                        {e.estado}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 truncate">
                      {e.esClasePrueba && <span className="bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded mr-1">Prueba</span>}
                      {workshop.titulo}
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-800">${e.monto.toLocaleString('es-CL')}</span>
                        <span className="text-xs text-gray-400">{new Date(e.createdAt).toLocaleDateString('es-CL')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`/tallerista/talleres/${String(workshop._id)}/inscritos`} className="text-xs text-indigo-600 hover:underline">Ver taller</Link>
                        <Link href={`/tallerista/inscritos/${String(student._id)}/reservas`} className="text-xs text-gray-500 hover:underline">Ver reservas</Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
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
          <>
            {/* Tabla — solo desktop */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3">Alumno</th>
                    <th className="px-4 py-3">Taller</th>
                    <th className="px-4 py-3">Sesiones · Precio</th>
                    <th className="px-4 py-3">Estado · Vence</th>
                    <th className="px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map(s => {
                    const student = s.studentId as StudentRef
                    const workshop = s.workshopId as WorkshopRef
                    const vi = getSubViewInfo(s)
                    return (
                      <tr key={String(s._id)} className={`border-t border-gray-100 hover:bg-gray-50${s.estado === 'vencida' || s.estado === 'cancelada' ? ' opacity-50' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800 text-sm">{student.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{student.email}</p>
                          {s.dependentNombreSnapshot && (
                            <p className="text-xs text-indigo-500 mt-0.5">↳ {s.dependentNombreSnapshot}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate text-sm">{workshop.titulo}</td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-gray-500">{vi.etiquetaSesiones}</p>
                          <p className="text-sm font-medium text-gray-800 mt-0.5">
                            ${s.monto.toLocaleString('es-CL')}
                            {s.precioEspecial && s.precioSnapshot !== undefined && s.precioSnapshot !== s.monto && (
                              <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded" title={s.notaPrecioEspecial ?? 'Precio especial'}>→ ${s.precioSnapshot.toLocaleString('es-CL')}</span>
                            )}
                            {s.precioEspecial && s.precioSnapshot === s.monto && (
                              <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">★</span>
                            )}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[s.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                            {s.estado === 'pendiente_pago' ? 'pend. pago' : s.estado}
                          </span>
                          <p className="text-xs text-gray-400 mt-1">{vi.vigenciaDateStr}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link href={`/tallerista/talleres/${String(workshop._id)}/inscritos`} className="text-xs text-indigo-600 hover:underline">Taller</Link>
                            <Link href={`/tallerista/inscritos/${String(student._id)}/reservas`} className="text-xs text-gray-500 hover:underline">Reservas</Link>
                            {s.estado === 'pendiente_pago' && (
                              <ConfirmarPagoModal
                                subscriptionId={String(s._id)}
                                studentName={student.name}
                                workshopTitle={workshop.titulo}
                                montoEsperado={s.precioSnapshot ?? s.monto}
                              />
                            )}
                            {(s.estado === 'vencida' || (s.estado === 'activa' && s.sesionesDisponibles === 0)) && (
                              <RenovarExternoModal
                                subscriptionId={String(s._id)}
                                studentName={student.name}
                                workshopTitle={workshop.titulo}
                                precioAnterior={s.precioSnapshot ?? s.monto}
                                clasesAnterior={s.sesionesTotales}
                                dependentNombre={s.dependentNombreSnapshot}
                              />
                            )}
                            {(s.estado === 'activa' || s.estado === 'pendiente_pago') && (
                              <EditarSuscripcionModal
                                subscriptionId={String(s._id)}
                                studentName={student.name}
                                workshopTitle={workshop.titulo}
                                precioActual={s.precioSnapshot ?? s.monto}
                                fechaVencimientoActual={new Date(s.fechaVencimiento).toISOString()}
                                notaActual={s.notaPrecioEspecial}
                                clasesCantidadActual={s.sesionesTotales}
                                sesionesUsadas={s.sesionesUsadas ?? 0}
                                autoRenovarActual={s.autoRenovar ?? false}
                              />
                            )}
                            {s.estado === 'activa' && (
                              <ReservarClaseModal
                                subscriptionId={String(s._id)}
                                studentName={student.name}
                                workshopTitle={workshop.titulo}
                                sesionesDisponibles={s.sesionesDisponibles}
                                dependentNombre={s.dependentNombreSnapshot}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Cards — solo móvil */}
            <div className="md:hidden space-y-3">
              {subscriptions.map(s => {
                const student = s.studentId as StudentRef
                const workshop = s.workshopId as WorkshopRef
                const vi = getSubViewInfo(s)
                return (
                  <div key={String(s._id)} className={`bg-white border border-gray-200 rounded-xl p-4 space-y-3${s.estado === 'vencida' || s.estado === 'cancelada' ? ' opacity-50' : ''}`}>
                    {/* Fila 1: nombre + estado */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{student.name}</p>
                        <p className="text-xs text-gray-500">{student.email}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${ESTADO_COLOR[s.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                        {s.estado === 'pendiente_pago' ? 'pend. pago' : s.estado}
                      </span>
                    </div>
                    {/* Fila 2: taller */}
                    <p className="text-xs text-gray-600 truncate">{workshop.titulo}</p>
                    {/* Fila 3: sesiones + precio + vencimiento */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span className="bg-gray-100 px-2 py-0.5 rounded">{vi.etiquetaSesiones}</span>
                      <span className="font-semibold text-gray-800">${s.monto.toLocaleString('es-CL')}</span>
                      {s.precioEspecial && s.precioSnapshot !== undefined && s.precioSnapshot !== s.monto && (
                        <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded" title={s.notaPrecioEspecial}>→ ${s.precioSnapshot.toLocaleString('es-CL')}</span>
                      )}
                      {s.precioEspecial && s.precioSnapshot === s.monto && (
                        <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">★ especial</span>
                      )}
                      <span>Vigente hasta {vi.vigenciaDateStr}</span>
                    </div>
                    {/* Fila 4: acciones */}
                    <div className="flex items-center gap-2 pt-1 border-t border-gray-100 flex-wrap">
                      <Link href={`/tallerista/talleres/${String(workshop._id)}/inscritos`} className="text-xs text-indigo-600 hover:underline">Ver taller</Link>
                      <Link href={`/tallerista/inscritos/${String(student._id)}/reservas`} className="text-xs text-gray-500 hover:underline">Ver reservas</Link>
                      {s.estado === 'pendiente_pago' && (
                        <ConfirmarPagoModal
                          subscriptionId={String(s._id)}
                          studentName={student.name}
                          workshopTitle={workshop.titulo}
                          montoEsperado={s.precioSnapshot ?? s.monto}
                        />
                      )}
                      {(s.estado === 'vencida' || (s.estado === 'activa' && s.sesionesDisponibles === 0)) && (
                        <RenovarExternoModal
                          subscriptionId={String(s._id)}
                          studentName={student.name}
                          workshopTitle={workshop.titulo}
                          precioAnterior={s.precioSnapshot ?? s.monto}
                          clasesAnterior={s.sesionesTotales}
                          dependentNombre={s.dependentNombreSnapshot}
                        />
                      )}
                      {(s.estado === 'activa' || s.estado === 'pendiente_pago') && (
                        <EditarSuscripcionModal
                          subscriptionId={String(s._id)}
                          studentName={student.name}
                          workshopTitle={workshop.titulo}
                          precioActual={s.precioSnapshot ?? s.monto}
                          fechaVencimientoActual={new Date(s.fechaVencimiento).toISOString()}
                          notaActual={s.notaPrecioEspecial}
                          clasesCantidadActual={s.sesionesTotales}
                          sesionesUsadas={s.sesionesUsadas ?? 0}
                          autoRenovarActual={s.autoRenovar ?? false}
                        />
                      )}
                      {s.estado === 'activa' && (
                        <ReservarClaseModal
                          subscriptionId={String(s._id)}
                          studentName={student.name}
                          workshopTitle={workshop.titulo}
                          sesionesDisponibles={s.sesionesDisponibles}
                          dependentNombre={s.dependentNombreSnapshot}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
