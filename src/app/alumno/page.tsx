import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import dbConnect from '@/lib/db'
import Enrollment from '@/models/Enrollment'
import Subscription from '@/models/Subscription'
import Booking from '@/models/Booking'
import User from '@/models/User'
import CancelBookingButton from '@/components/CancelBookingButton'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

interface WorkshopRef { titulo: string; slug: string }

interface EnrollmentLean {
  _id: Types.ObjectId
  workshopId: WorkshopRef
  estado: string
  monto: number
  slotIndex: number | null
  createdAt: Date
}

interface SubscriptionLean {
  _id: Types.ObjectId
  workshopId: WorkshopRef
  estado: string
  sesionesDisponibles: number
  sesionesTotales: number
  fechaVencimiento: Date
}

interface BookingLean {
  _id: Types.ObjectId
  workshopId: WorkshopRef
  slotIndex: number
  fecha: Date
  estado: string
}

export default async function AlumnoDashboard() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/alumno/acceso')

  await dbConnect()
  const studentId = session.user.id

  // Cargar datos del alumno en paralelo
  const [user, enrollments, subscriptions, upcomingBookings] = await Promise.all([
    User.findById(studentId).select('name creditoDisponible').lean<{ name: string; creditoDisponible: number }>(),
    Enrollment.find({ studentId, estado: 'pagado', activo: true })
      .populate('workshopId', 'titulo slug')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean<EnrollmentLean[]>(),
    Subscription.find({ studentId, estado: 'activa', activo: true })
      .populate('workshopId', 'titulo slug')
      .sort({ fechaVencimiento: 1 })
      .lean<SubscriptionLean[]>(),
    Booking.find({ studentId, estado: 'reservada', fecha: { $gte: new Date() }, activo: true })
      .populate('workshopId', 'titulo slug')
      .sort({ fecha: 1 })
      .limit(5)
      .lean<BookingLean[]>(),
  ])

  return (
    <div className="space-y-8">
      {/* Saludo */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Hola, {user?.name?.split(' ')[0] ?? 'alumno'} 👋
        </h1>
        <p className="text-gray-500 mt-1 text-sm">Tu espacio de aprendizaje en Tallerea.</p>
      </div>

      {/* Tarjeta crédito */}
      {(user?.creditoDisponible ?? 0) > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Crédito disponible</p>
            <p className="text-2xl font-bold text-green-800">
              ${(user?.creditoDisponible ?? 0).toLocaleString('es-CL')}
            </p>
          </div>
          <Link href="/alumno/credito" className="text-sm text-green-700 underline">Ver historial</Link>
        </div>
      )}

      {/* Próximas reservas */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">Próximas sesiones</h2>
        </div>
        {upcomingBookings.length === 0 ? (
          <p className="text-sm text-gray-400">Sin sesiones reservadas próximamente.</p>
        ) : (
          <div className="space-y-3">
            {upcomingBookings.map(b => (
              <div key={String(b._id)} className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{(b.workshopId as WorkshopRef).titulo}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(b.fecha).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                    {' · Sesión '}
                    {b.slotIndex + 1}
                  </p>
                </div>
                <CancelBookingButton bookingId={String(b._id)} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Suscripciones activas */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">Suscripciones activas</h2>
        </div>
        {subscriptions.length === 0 ? (
          <p className="text-sm text-gray-400">Sin suscripciones activas.</p>
        ) : (
          <div className="space-y-3">
            {subscriptions.map(s => (
              <div key={String(s._id)} className="bg-white border border-gray-200 rounded-xl px-5 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{(s.workshopId as WorkshopRef).titulo}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {s.sesionesDisponibles} de {s.sesionesTotales} sesiones disponibles
                      · Vence {new Date(s.fechaVencimiento).toLocaleDateString('es-CL')}
                    </p>
                  </div>
                  <Link
                    href={`/alumno/reservas?sub=${String(s._id)}&workshop=${encodeURIComponent((s.workshopId as WorkshopRef).slug)}`}
                    className="text-xs text-purple-600 hover:underline whitespace-nowrap ml-4"
                  >
                    Reservar sesión →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Inscripciones puntuales recientes */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">Talleres inscritos</h2>
          <Link href="/alumno/historial" className="text-xs text-purple-600 hover:underline">Ver todo</Link>
        </div>
        {enrollments.length === 0 ? (
          <p className="text-sm text-gray-400">Aún no te has inscrito en ningún taller.{' '}
            <Link href="/talleres" className="text-purple-600 underline">Explorar talleres</Link>
          </p>
        ) : (
          <div className="space-y-3">
            {enrollments.map(e => (
              <div key={String(e._id)} className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{(e.workshopId as WorkshopRef).titulo}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Pagado · ${e.monto.toLocaleString('es-CL')}
                  </p>
                </div>
                <Link
                  href={`/talleres/${(e.workshopId as WorkshopRef).slug}`}
                  className="text-xs text-gray-500 hover:text-purple-600"
                >
                  Ver taller
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
