import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import dbConnect from '@/lib/db'
import Subscription from '@/models/Subscription'
import Booking from '@/models/Booking'
import Workshop from '@/models/Workshop'
import { Types } from 'mongoose'
import ReservasCalendar from './ReservasCalendar'
import type { CalendarSlot } from './ReservasCalendar'
import { getSubViewInfo } from '@/lib/subscriptionView'

export const dynamic = 'force-dynamic'

interface SlotLean { horaInicio: string; horaFin: string; fecha?: Date; reservas: number; cancelado: boolean }
interface WorkshopLean { _id: Types.ObjectId; titulo: string; slug: string; cupoPorSesion: number; slots: SlotLean[] }
interface SubLean {
  _id: Types.ObjectId
  estado: string
  sesionesUsadas: number
  sesionesTotales: number
  sesionesDisponibles: number
  fechaVencimiento: Date
  clasesPrepagadas?: { cantidad: number; consumidas: number; caducaEn?: Date }
}
interface BookingLean { _id: Types.ObjectId; slotIndex: number; fecha: Date; estado: string }

export default async function ReservasPage({ searchParams }: { searchParams: Promise<{ sub?: string; workshop?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/alumno/acceso')

  const { sub: subId, workshop: workshopSlug } = await searchParams
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

  const reservedMap = new Map(bookings.map(b => [b.slotIndex, String(b._id)]))
  const cupo = workshop.cupoPorSesion

  // Construir CalendarSlot[] para todos los slots futuros + los ya reservados por el alumno
  const now = new Date()
  const calendarSlots: CalendarSlot[] = workshop.slots
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => {
      if (!s.fecha) return false
      // Comparar fecha+horaFin en vez de solo la fecha (medianoche UTC).
      // Así los slots de HOY que aún no terminaron aparecen como disponibles.
      const [hf, mf] = (s.horaFin ?? '23:59').split(':').map(Number)
      const slotEnd = new Date(s.fecha)
      slotEnd.setUTCHours(hf, mf, 0, 0)
      const esFuturo = slotEnd > now
      const esMio = reservedMap.has(i)
      return esFuturo || esMio
    })
    .map(({ s, i }) => ({
      index: i,
      horaInicio: s.horaInicio,
      horaFin: s.horaFin,
      fecha: s.fecha ? new Date(s.fecha).toISOString() : new Date().toISOString(),
      reservas: s.reservas,
      cancelado: s.cancelado,
      cupoMax: cupo,
      miReservaId: reservedMap.get(i),
    }))

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link href="/alumno" className="text-sm text-indigo-600 hover:underline">← Volver</Link>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">{workshop.titulo}</h1>
      </div>

      {(() => {
        const vi = getSubViewInfo(sub)
        return (
          <ReservasCalendar
            subscriptionId={subId}
            workshopId={String(workshop._id)}
            workshopSlug={workshop.slug}
            sesionesDisponibles={vi.disponibles}
            fechaVencimiento={vi.fechaVigenciaReal.toISOString()}
            allSlots={calendarSlots}
          />
        )
      })()}
    </div>
  )
}
