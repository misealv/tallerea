import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import dbConnect from '@/lib/db'
import Workshop from '@/models/Workshop'
import Enrollment from '@/models/Enrollment'
import Subscription from '@/models/Subscription'
import Booking from '@/models/Booking'
import { Types } from 'mongoose'
import MarcaAsistenciaButton from '@/components/MarcaAsistenciaButton'
import MarcaAsistenciaEnrollmentButton from '@/components/MarcaAsistenciaEnrollmentButton'
import EditarPrecioButton from '@/components/EditarPrecioButton'
import CancelarInscripcionButton from '@/components/CancelarInscripcionButton'
import ReservarClaseModal from '@/app/tallerista/inscritos/ReservarClaseModal'
import { getSubViewInfo } from '@/lib/subscriptionView'

export const dynamic = 'force-dynamic'

interface StudentRef { name: string; email: string }
interface EnrollmentLean { _id: Types.ObjectId; studentId: StudentRef; estado: string; monto: number; slotIndex: number | null; createdAt: Date; origenInscripcion?: string; asistio?: boolean | null }
interface SubLean { _id: Types.ObjectId; studentId: StudentRef; estado: string; sesionesUsadas: number; sesionesTotales: number; sesionesDisponibles: number; fechaVencimiento: Date; monto: number; clasesPrepagadas?: { cantidad: number; consumidas: number; caducaEn?: Date }; origenInscripcion?: string; precioEspecial?: boolean; precioSnapshot?: number; notaPrecioEspecial?: string; dependentNombreSnapshot?: string }
interface BookingLean { _id: Types.ObjectId; studentId: StudentRef; subscriptionId: Types.ObjectId; slotIndex: number; fecha: Date; estado: string; dependentNombreSnapshot?: string }
interface WorkshopLean { _id: Types.ObjectId; titulo: string; ownerId?: Types.ObjectId; accountId?: Types.ObjectId; slots: { horaInicio: string; horaFin: string; fecha?: Date }[] }

const ESTADO_COLOR: Record<string, string> = {
  pagado: 'bg-green-100 text-green-700', pendiente: 'bg-yellow-100 text-yellow-700',
  cancelado: 'bg-gray-100 text-gray-400', activa: 'bg-indigo-100 text-indigo-700',
  vencida: 'bg-gray-100 text-gray-400', reservada: 'bg-blue-100 text-blue-700',
  asistio: 'bg-green-100 text-green-700', no_asistio: 'bg-red-100 text-red-500',
  cancelada: 'bg-gray-100 text-gray-400',
}

export default async function InscritosPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { filtro?: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  await dbConnect()

  const workshop = await Workshop.findById(params.id)
    .select('titulo ownerId accountId slots activo')
    .lean<WorkshopLean>()

  if (!workshop) notFound()

  const ownerId = String(workshop.ownerId ?? workshop.accountId ?? '')
  if (ownerId !== session.user.id) notFound()

  const [enrollments, subscriptions] = await Promise.all([
    Enrollment.find({ workshopId: params.id, activo: true })
      .populate('studentId', 'name email')
      .sort({ createdAt: -1 })
      .lean<EnrollmentLean[]>(),
    Subscription.find({ workshopId: params.id, activo: true })
      .populate('studentId', 'name email')
      .sort({ createdAt: -1 })
      .lean<SubLean[]>(),
  ])

  const activeSubIds = subscriptions.map(s => String(s._id))
  const bookings = activeSubIds.length > 0
    ? await Booking.find({ subscriptionId: { $in: activeSubIds }, activo: true, estado: { $ne: 'cancelada' } })
        .populate('studentId', 'name email')
        .sort({ fecha: -1 })
        .lean<BookingLean[]>()
    : []

  const filtro = searchParams?.filtro
  const enrollmentsFiltrados = filtro === 'manual'
    ? enrollments.filter(e => e.origenInscripcion === 'manual')
    : filtro === 'precio-especial'
      ? []   // los puntuales no tienen precio especial — ocultar sección
      : enrollments
  const subscriptionsFiltradas = filtro === 'precio-especial'
    ? subscriptions.filter(s => s.precioEspecial)
    : filtro === 'manual'
      ? subscriptions.filter(s => s.origenInscripcion === 'manual')
      : subscriptions

  const totalPrecioEspecial = subscriptions.filter(s => s.precioEspecial).length
  const totalManual = [...enrollments, ...subscriptions].filter(x => x.origenInscripcion === 'manual').length

  return (
    <div className="space-y-10 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/tallerista/talleres" className="text-sm text-indigo-600 hover:underline">← Mis talleres</Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">{workshop.titulo}</h1>
          <p className="text-sm text-gray-500 mt-1">Inscritos y reservas activas</p>
        </div>
        <Link
          href={`/tallerista/talleres/${params.id}/inscribir`}
          className="shrink-0 mt-6 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          + Inscribir alumno
        </Link>
      </div>

      {/* Filtros rápidos */}
      <div className="flex gap-2 flex-wrap">
        <Link href={`/tallerista/talleres/${params.id}/inscritos`}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            !filtro ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}>Todos</Link>
        {totalPrecioEspecial > 0 && (
          <Link href={`/tallerista/talleres/${params.id}/inscritos?filtro=precio-especial`}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              filtro === 'precio-especial' ? 'bg-violet-700 text-white border-violet-700' : 'border-violet-300 text-violet-700 hover:bg-violet-50'
            }`}>Precio especial ({totalPrecioEspecial})</Link>
        )}
        {totalManual > 0 && (
          <Link href={`/tallerista/talleres/${params.id}/inscritos?filtro=manual`}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              filtro === 'manual' ? 'bg-amber-700 text-white border-amber-700' : 'border-amber-300 text-amber-700 hover:bg-amber-50'
            }`}>Inscripción manual ({totalManual})</Link>
        )}
      </div>

      {/* Inscripciones puntuales */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Inscripciones puntuales ({enrollmentsFiltrados.length})</h2>
        {enrollmentsFiltrados.length === 0 ? <p className="text-sm text-gray-400">Sin inscripciones.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-2">Alumno</th><th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Monto</th><th className="px-4 py-2">Estado</th><th className="px-4 py-2">Fecha</th><th className="px-4 py-2">Asistencia</th><th className="px-4 py-2"></th>
              </tr></thead>
              <tbody>{enrollmentsFiltrados.map(e => (
                <tr key={String(e._id)} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-800">
                    {(e.studentId as StudentRef).name}
                    {e.origenInscripcion === 'manual' && (
                      <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">manual</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500">{(e.studentId as StudentRef).email}</td>
                  <td className="px-4 py-2">${e.monto.toLocaleString('es-CL')}</td>
                  <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[e.estado] ?? ''}`}>{e.estado}</span></td>
                  <td className="px-4 py-2 text-gray-400">{new Date(e.createdAt).toLocaleDateString('es-CL')}</td>
                  <td className="px-4 py-2">
                    {e.estado === 'pagado' && (
                      <MarcaAsistenciaEnrollmentButton
                        enrollmentId={String(e._id)}
                        asistioActual={e.asistio}
                      />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <CancelarInscripcionButton
                      id={String(e._id)}
                      tipo="enrollment"
                      nombreAlumno={(e.studentId as StudentRef).name}
                    />
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {/* Suscripciones activas */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Suscripciones ({subscriptionsFiltradas.length})</h2>
        {subscriptionsFiltradas.length === 0 ? <p className="text-sm text-gray-400">Sin suscripciones.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-2">Alumno</th><th className="px-4 py-2">Precio · Clases · Vigencia</th>
                <th className="px-4 py-2">Estado</th><th className="px-4 py-2"></th><th className="px-4 py-2"></th><th className="px-4 py-2"></th>
              </tr></thead>
              <tbody>{subscriptionsFiltradas.map(s => {
                const prepaid = s.clasesPrepagadas
                const esBecado = s.precioEspecial && s.precioSnapshot === 0
                const vi = getSubViewInfo(s)
                // [FIX 2026-05] usar vi.prepaidActivo (fuente única sesionesDisponibles).
                // Antes: prepaid.consumidas < prepaid.cantidad → falsos positivos tras reset.
                const prepaidActivo = vi.prepaidActivo
                return (
                  <tr key={String(s._id)} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-800">
                      {(s.studentId as StudentRef).name}
                      {s.dependentNombreSnapshot && (
                        <span className="ml-1.5 text-xs text-gray-500">({s.dependentNombreSnapshot})</span>
                      )}
                      {s.origenInscripcion === 'manual' && (
                        <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">manual</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-0.5">
                        {/* Precio */}
                        {s.precioEspecial ? (
                          <span className="inline-flex items-center gap-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              esBecado ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
                            }`} title={s.notaPrecioEspecial ?? ''}>
                              {esBecado ? 'Becado' : 'Precio especial'}
                            </span>
                            <span className="text-gray-700 font-medium">${(s.precioSnapshot ?? 0).toLocaleString('es-CL')}</span>
                          </span>
                        ) : (
                          <span className="text-gray-700 font-medium">${s.monto.toLocaleString('es-CL')}</span>
                        )}
                        {/* Clases — fuente única sesionesDisponibles/sesionesUsadas */}
                        {prepaidActivo ? (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium w-fit">
                            {vi.disponibles} disp. · {vi.usadas}/{vi.totales} usadas
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {vi.disponibles} disp. · {vi.usadas}/{vi.totales === 999 ? '∞' : vi.totales} usadas
                          </span>
                        )}
                        {/* Vigencia */}
                        {prepaidActivo && prepaid!.caducaEn ? (
                          <span className={`text-xs ${new Date(prepaid!.caducaEn) < new Date() ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                            {new Date(prepaid!.caducaEn) < new Date() ? '⚠ Caducó' : 'Caduca'} {new Date(prepaid!.caducaEn).toLocaleDateString('es-CL')}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Vence {vi.vigenciaDateStr}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[s.estado] ?? ''}`}>{s.estado}</span></td>
                    <td className="px-4 py-2">
                      <EditarPrecioButton
                        subscriptionId={String(s._id)}
                        precioActual={s.precioSnapshot ?? s.monto}
                        notaActual={s.notaPrecioEspecial}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <CancelarInscripcionButton
                        id={String(s._id)}
                        tipo="subscription"
                        nombreAlumno={(s.studentId as StudentRef).name}
                      />
                    </td>
                    <td className="px-4 py-2">
                      {s.estado === 'activa' && (
                        <ReservarClaseModal
                          subscriptionId={String(s._id)}
                          studentName={(s.studentId as StudentRef).name}
                          workshopTitle={workshop.titulo}
                          sesionesDisponibles={s.sesionesDisponibles}
                          dependentNombre={s.dependentNombreSnapshot}
                        />
                      )}
                    </td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        )}
      </section>

      {/* Reservas de suscriptores */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Reservas activas ({bookings.length})</h2>
        {bookings.length === 0 ? <p className="text-sm text-gray-400">Sin reservas activas.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-2">Alumno</th><th className="px-4 py-2">Sesión</th>
                <th className="px-4 py-2">Fecha</th><th className="px-4 py-2">Estado</th><th className="px-4 py-2">Asistencia</th>
              </tr></thead>
              <tbody>{bookings.map(b => {
                const slot = workshop.slots[b.slotIndex]
                const titular = (b.studentId as StudentRef).name
                const display = b.dependentNombreSnapshot
                  ? `${b.dependentNombreSnapshot} (apoderad@: ${titular})`
                  : titular
                return (
                  <tr key={String(b._id)} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-800">{display}</td>
                    <td className="px-4 py-2 text-gray-500">{slot ? `${slot.horaInicio}–${slot.horaFin}` : `#${b.slotIndex + 1}`}</td>
                    <td className="px-4 py-2 text-gray-400">{new Date(b.fecha).toLocaleDateString('es-CL')}</td>
                    <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[b.estado] ?? ''}`}>{b.estado}</span></td>
                    <td className="px-4 py-2"><MarcaAsistenciaButton bookingId={String(b._id)} estadoActual={b.estado} /></td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
