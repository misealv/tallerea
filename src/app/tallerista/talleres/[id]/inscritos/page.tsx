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

export const dynamic = 'force-dynamic'

interface StudentRef { name: string; email: string }
interface EnrollmentLean { _id: Types.ObjectId; studentId: StudentRef; estado: string; monto: number; slotIndex: number | null; createdAt: Date }
interface SubLean { _id: Types.ObjectId; studentId: StudentRef; estado: string; sesionesUsadas: number; sesionesTotales: number; fechaVencimiento: Date; monto: number; clasesPrepagadas?: { cantidad: number; consumidas: number }; origenInscripcion?: string }
interface BookingLean { _id: Types.ObjectId; studentId: StudentRef; subscriptionId: Types.ObjectId; slotIndex: number; fecha: Date; estado: string; dependentNombreSnapshot?: string }
interface WorkshopLean { _id: Types.ObjectId; titulo: string; ownerId?: Types.ObjectId; accountId?: Types.ObjectId; slots: { horaInicio: string; horaFin: string; fecha?: Date }[] }

const ESTADO_COLOR: Record<string, string> = {
  pagado: 'bg-green-100 text-green-700', pendiente: 'bg-yellow-100 text-yellow-700',
  cancelado: 'bg-gray-100 text-gray-400', activa: 'bg-indigo-100 text-indigo-700',
  vencida: 'bg-gray-100 text-gray-400', reservada: 'bg-blue-100 text-blue-700',
  asistio: 'bg-green-100 text-green-700', no_asistio: 'bg-red-100 text-red-500',
  cancelada: 'bg-gray-100 text-gray-400',
}

export default async function InscritosPage({ params }: { params: { id: string } }) {
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

      {/* Inscripciones puntuales */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Inscripciones puntuales ({enrollments.length})</h2>
        {enrollments.length === 0 ? <p className="text-sm text-gray-400">Sin inscripciones.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-2">Alumno</th><th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Monto</th><th className="px-4 py-2">Estado</th><th className="px-4 py-2">Fecha</th>
              </tr></thead>
              <tbody>{enrollments.map(e => (
                <tr key={String(e._id)} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-800">{(e.studentId as StudentRef).name}</td>
                  <td className="px-4 py-2 text-gray-500">{(e.studentId as StudentRef).email}</td>
                  <td className="px-4 py-2">${e.monto.toLocaleString('es-CL')}</td>
                  <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[e.estado] ?? ''}`}>{e.estado}</span></td>
                  <td className="px-4 py-2 text-gray-400">{new Date(e.createdAt).toLocaleDateString('es-CL')}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {/* Suscripciones activas */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Suscripciones ({subscriptions.length})</h2>
        {subscriptions.length === 0 ? <p className="text-sm text-gray-400">Sin suscripciones.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-2">Alumno</th><th className="px-4 py-2">Acceso</th>
                <th className="px-4 py-2">Estado</th><th className="px-4 py-2">Vence</th>
              </tr></thead>
              <tbody>{subscriptions.map(s => {
                const prepaid = s.clasesPrepagadas
                const prepaidActivo = prepaid && prepaid.consumidas < prepaid.cantidad
                return (
                  <tr key={String(s._id)} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-800">{(s.studentId as StudentRef).name}</td>
                    <td className="px-4 py-2">
                      {prepaidActivo ? (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                          Prepagada — {prepaid!.cantidad - prepaid!.consumidas}/{prepaid!.cantidad}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">{s.sesionesTotales - s.sesionesUsadas}/{s.sesionesTotales} sesiones</span>
                      )}
                    </td>
                    <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[s.estado] ?? ''}`}>{s.estado}</span></td>
                    <td className="px-4 py-2 text-gray-400">{new Date(s.fechaVencimiento).toLocaleDateString('es-CL')}</td>
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
