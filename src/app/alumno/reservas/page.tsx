import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import dbConnect from '@/lib/db'
import Subscription from '@/models/Subscription'
import Booking from '@/models/Booking'
import Workshop from '@/models/Workshop'
import { Types } from 'mongoose'
import ReservarSlotButton from '@/components/ReservarSlotButton'
import CancelBookingButton from '@/components/CancelBookingButton'

export const dynamic = 'force-dynamic'

interface SlotLean { horaInicio: string; horaFin: string; fecha?: Date; reservas: number; cancelado: boolean; cupoDisponible?: number }
interface WorkshopLean { _id: Types.ObjectId; titulo: string; cupoPorSesion: number; slots: SlotLean[] }
interface SubLean { _id: Types.ObjectId; estado: string; sesionesDisponibles: number; fechaVencimiento: Date }
interface BookingLean { _id: Types.ObjectId; slotIndex: number; fecha: Date; estado: string }

export default async function ReservasPage({ searchParams }: { searchParams: { sub?: string; workshop?: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/alumno/acceso')

  const { sub: subId, workshop: workshopSlug } = searchParams
  if (!subId || !workshopSlug) redirect('/alumno')

  await dbConnect()
  const studentId = session.user.id

  const [sub, workshop] = await Promise.all([
    Subscription.findOne({ _id: subId, studentId, activo: true }).lean<SubLean>(),
    Workshop.findOne({ slug: workshopSlug, activo: true }).lean<WorkshopLean>(),
  ])

  if (!sub || !workshop) redirect('/alumno')

  const bookings = await Booking.find({ subscriptionId: subId, estado: { $ne: 'cancelada' }, activo: true })
    .lean<BookingLean[]>()

  const reservedIndexes = new Set(bookings.map(b => b.slotIndex))
  const now = new Date()
  const cupo = workshop.cupoPorSesion

  // Slots disponibles para reservar
  const availableSlots = workshop.slots
    .map((s, i) => ({ ...s, index: i }))
    .filter(s => !s.cancelado && !reservedIndexes.has(s.index) && s.fecha && s.fecha > now && s.reservas < cupo)

  const workshopIdStr = String(workshop._id)

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <Link href="/alumno" className="text-sm text-indigo-600 hover:underline">← Volver</Link>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">{workshop.titulo}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Sesiones disponibles: <span className="font-semibold text-indigo-700">{sub.sesionesDisponibles}</span>
          {sub.fechaVencimiento && (
            <> · Vence {new Date(sub.fechaVencimiento).toLocaleDateString('es-CL')}</>
          )}
        </p>
      </div>

      {/* Reservas activas */}
      {bookings.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Tus reservas actuales</h2>
          <div className="space-y-2">
            {bookings.map(b => {
              const slot = workshop.slots[b.slotIndex]
              return (
                <div key={String(b._id)} className="bg-white border border-gray-200 rounded-xl px-5 py-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {slot?.fecha ? new Date(slot.fecha).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }) : `Sesión ${b.slotIndex + 1}`}
                      {slot && <> · {slot.horaInicio}–{slot.horaFin}</>}
                    </p>
                    <p className="text-xs text-gray-400 capitalize mt-0.5">{b.estado}</p>
                  </div>
                  <CancelBookingButton bookingId={String(b._id)} />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Slots para reservar */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Sesiones disponibles</h2>
        {availableSlots.length === 0 ? (
          <p className="text-sm text-gray-400">No hay sesiones disponibles en este período.</p>
        ) : (
          <div className="space-y-2">
            {availableSlots.map(s => (
              <div key={s.index} className="bg-white border border-gray-100 rounded-xl px-5 py-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {s.fecha ? new Date(s.fecha).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }) : `Sesión ${s.index + 1}`}
                    <> · {s.horaInicio}–{s.horaFin}</>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {cupo - s.reservas} lugar{cupo - s.reservas !== 1 ? 'es' : ''} libre{cupo - s.reservas !== 1 ? 's' : ''}
                  </p>
                </div>
                <ReservarSlotButton
                  subscriptionId={subId}
                  workshopId={workshopIdStr}
                  slotIndex={s.index}
                  disabled={sub.sesionesDisponibles <= 0}
                />
              </div>
            ))}
          </div>
        )}
        {sub.sesionesDisponibles <= 0 && (
          <p className="text-sm text-amber-600 mt-3">Sin sesiones disponibles en tu suscripción actual.</p>
        )}
      </section>
    </div>
  )
}
