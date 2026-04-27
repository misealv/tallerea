import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import dbConnect from '@/lib/db'
import Enrollment from '@/models/Enrollment'
import Subscription from '@/models/Subscription'
import Booking from '@/models/Booking'
import User from '@/models/User'
import Workshop from '@/models/Workshop'
import Location from '@/models/Location'
import CancelBookingButton from '@/components/CancelBookingButton'
import TallerCard from '@/components/TallerCard'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

interface WorkshopRef { titulo: string; slug: string }
interface WorkshopWithMedia { titulo: string; slug: string; imagenes: string[]; ownerId: Types.ObjectId }
interface WorkshopWithSlots { titulo: string; slug: string; slots: Array<{ horaInicio: string; horaFin: string; cancelado?: boolean }> }
interface OwnerRef { name: string }
interface LocationRef { nombre: string; direccion: string; comuna: string; ciudad: string }
interface SlotInfo { dia?: string; horaInicio: string; horaFin: string; fecha?: Date }
interface ClasePruebaDetail {
  titulo: string
  slug: string
  horaInicio: string
  horaFin: string
  fechaSlot: string | null  // YYYY-MM-DD
  diaSemana: string | null
  profesorNombre: string
  direccion: string | null
  monto: number
  enrollmentId: string
}

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
  clasesPrepagadas?: { cantidad: number; consumidas: number; caducaEn?: Date }
}

interface BookingLean {
  _id: Types.ObjectId
  workshopId: WorkshopWithSlots
  subscriptionId: Types.ObjectId
  slotIndex: number
  fecha: Date
  estado: string
}

const DIAS_LABEL: Record<string, string> = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
  viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
}

async function resolveClasePrueba(enrolls: EnrollmentLean[]): Promise<ClasePruebaDetail[]> {
  const pruebas = enrolls.filter(e => (e as unknown as { esClasePrueba?: boolean }).esClasePrueba)
  const details: ClasePruebaDetail[] = []
  for (const e of pruebas) {
    try {
      const w = e.workshopId as WorkshopRef | null
      if (!w?.slug) continue
      const wDoc = await Workshop.findOne({ slug: w.slug })
        .select('ownerId locationId slots')
        .lean<{ ownerId: Types.ObjectId; locationId?: Types.ObjectId; slots: SlotInfo[] }>()
      if (!wDoc) continue
      const slot: SlotInfo | undefined = e.slotIndex != null ? wDoc.slots[e.slotIndex] : undefined
      const [owner, loc] = await Promise.all([
        User.findById(wDoc.ownerId).select('name').lean<OwnerRef>(),
        wDoc.locationId ? Location.findById(wDoc.locationId).select('nombre direccion comuna ciudad').lean<LocationRef>() : null,
      ])
      details.push({
        titulo: w.titulo,
        slug: w.slug,
        horaInicio: slot?.horaInicio ?? '',
        horaFin: slot?.horaFin ?? '',
        fechaSlot: slot?.fecha ? new Date(slot.fecha).toISOString().slice(0, 10) : null,
        diaSemana: slot?.dia ? (DIAS_LABEL[slot.dia] ?? slot.dia) : null,
        profesorNombre: owner?.name ?? 'Tallerista',
        direccion: loc ? `${loc.direccion}, ${loc.comuna}, ${loc.ciudad}` : null,
        monto: e.monto,
        enrollmentId: String(e._id),
      })
    } catch {
      // Si falla una inscripción, continuar con las demás
      continue
    }
  }
  return details
}

export default async function AlumnoDashboard() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/alumno/acceso')

  await dbConnect()
  const studentId = session.user.id

  const [user, enrollments, subscriptions, upcomingBookings, cancelledByProf] = await Promise.all([
    User.findById(studentId).select('name creditoDisponible').lean<{ name: string; creditoDisponible: number }>(),
    Enrollment.find({ studentId, estado: 'pagado', activo: true })
      .populate('workshopId', 'titulo slug')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean<EnrollmentLean[]>() as Promise<EnrollmentLean[]>,
    Subscription.find({ studentId, estado: 'activa', activo: true })
      .populate('workshopId', 'titulo slug imagenes ownerId')
      .sort({ fechaVencimiento: 1 })
      .lean<SubscriptionLean[]>(),
    Booking.find({ studentId, estado: 'reservada', fecha: { $gte: new Date() }, activo: true })
      .populate('workshopId', 'titulo slug slots')
      .sort({ fecha: 1 })
      .limit(5)
      .lean<BookingLean[]>(),
    // Bookings cancelados por el tallerista en los últimos 30 días (para mostrar devoluciones)
    Booking.find({
      studentId,
      canceladaRazon: 'tallerista',
      canceladaEn: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      activo: true,
    }).populate('workshopId', 'titulo slug').lean<BookingLean[]>(),
  ])

  const clasesPrueba = await resolveClasePrueba(enrollments).catch((err) => {
    console.error('[alumno] Error cargando detalles de clase de prueba:', err)
    return [] as ClasePruebaDetail[]
  })

  // Batch-fetch nombres de profesores (para las cards de taller)
  const ownerIds = subscriptions
    .map(s => (s.workshopId as unknown as WorkshopWithMedia).ownerId)
    .filter((id): id is Types.ObjectId => Boolean(id))
  const profDocs = ownerIds.length > 0
    ? await User.find({ _id: { $in: ownerIds } }).select('name').lean<{ _id: Types.ObjectId; name: string }[]>()
    : []
  const profMap = new Map(profDocs.map(p => [String(p._id), p.name]))

  // Filtrar bookings cuyo slot fue cancelado pero el booking no se actualizó aún (datos inconsistentes)
  const activeUpcomingBookings = upcomingBookings.filter(b => {
    const w = b.workshopId as WorkshopWithSlots
    const slot = w.slots?.[b.slotIndex]
    return !slot?.cancelado
  })

  // Mapa de subscriptionId → próximo booking para usarlo en cada TallerCard
  const bookingBySub = new Map<string, BookingLean>()
  for (const b of activeUpcomingBookings) {
    const subId = String(b.subscriptionId)
    if (!bookingBySub.has(subId)) bookingBySub.set(subId, b)
  }

  // Variables pre-computadas para el hero unificado
  const totalDisponibles = subscriptions.reduce((acc, s) => {
    const prepaid = s.clasesPrepagadas
    return acc + (prepaid && prepaid.consumidas < prepaid.cantidad
      ? prepaid.cantidad - prepaid.consumidas
      : s.sesionesDisponibles)
  }, 0)
  const hasActiveTalleres = subscriptions.length > 0 || clasesPrueba.length > 0
  const proximaBooking = activeUpcomingBookings[0] ?? null
  const otrasBookingsCount = Math.max(0, activeUpcomingBookings.length - 1)

  // Datos derivados del proximaBooking (evita IIFE en JSX)
  let proximaWorkshop: WorkshopWithSlots | null = null
  let proximaSlot: { horaInicio: string; horaFin: string; cancelado?: boolean } | undefined
  let proximaFecha: Date | null = null
  if (proximaBooking) {
    proximaWorkshop = proximaBooking.workshopId as WorkshopWithSlots
    proximaSlot = proximaWorkshop.slots?.[proximaBooking.slotIndex]
    proximaFecha = new Date(proximaBooking.fecha)
  }

  return (
    <div className="space-y-6">
      {/* Saludo */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Hola, {user?.name?.split(' ')[0] ?? 'alumno'} 👋
        </h1>
        <p className="text-gray-500 mt-1 text-sm">Tu espacio de aprendizaje en Tallerea.</p>
      </div>

      {/* Tarjeta saldo a favor */}
      {(user?.creditoDisponible ?? 0) > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">💰 Saldo a favor</p>
            <Link href="/alumno/credito" className="text-xs text-green-700 underline">Ver historial</Link>
          </div>
          <p className="text-2xl font-bold text-green-800">
            ${(user?.creditoDisponible ?? 0).toLocaleString('es-CL')} CLP
          </p>
          <p className="text-xs text-green-600 mt-1.5">
            Es dinero a tu favor por una devolución. Se descuenta automáticamente cuando compres tu próximo taller.
          </p>
          <Link href="/talleres" className="inline-block mt-2 text-xs text-green-800 font-semibold hover:underline">Explorar talleres →</Link>
        </div>
      )}

      {/* Clases de prueba compradas */}
      {/* Hero unificado: próxima clase / sin reserva / bienvenida */}
      {proximaBooking !== null && proximaWorkshop && proximaFecha ? (
        // Estado: hay clase reservada → hero morado
        <div className="bg-purple-600 rounded-2xl px-5 py-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-200">Tu próxima clase</p>
          <p className="font-bold text-lg mt-1 leading-tight">{proximaWorkshop.titulo}</p>
          {proximaSlot && (
            <p className="text-3xl font-bold mt-3 tabular-nums">{proximaSlot.horaInicio} – {proximaSlot.horaFin}</p>
          )}
          <p className="text-sm text-purple-200 mt-1 capitalize">
            {proximaFecha.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          {otrasBookingsCount > 0 && (
            <p className="text-xs text-purple-200 mt-2">
              + {otrasBookingsCount} {otrasBookingsCount === 1 ? 'clase reservada' : 'clases reservadas'} más
            </p>
          )}
          <div className="mt-4 pt-3 border-t border-purple-500">
            <CancelBookingButton bookingId={String(proximaBooking._id)} />
          </div>
        </div>
      ) : hasActiveTalleres ? (
        // Estado: tiene talleres activos pero sin clase agendada → hero gris
        <div className="bg-gray-100 border border-gray-200 rounded-2xl px-5 py-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tu próxima clase</p>
          {totalDisponibles > 0 && subscriptions.length > 0 ? (
            <>
              <p className="font-bold text-gray-900 text-base">No tienes clases agendadas</p>
              <p className="text-sm text-gray-600 mt-2 mb-3">
                Tienes <span className="font-semibold text-purple-700">{totalDisponibles} {totalDisponibles === 1 ? 'clase disponible' : 'clases disponibles'}</span> para reservar.
              </p>
              <Link
                href={`/alumno/reservas?sub=${String(subscriptions[0]._id)}&workshop=${encodeURIComponent((subscriptions[0].workshopId as WorkshopRef).slug)}`}
                className="inline-flex items-center gap-1 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 px-4 py-2.5 rounded-lg transition-colors"
              >
                Reserva tu próxima clase →
              </Link>
            </>
          ) : subscriptions.length > 0 ? (
            <>
              <p className="font-bold text-gray-900 text-base">Ya usaste todas tus clases</p>
              <p className="text-sm text-gray-600 mt-2 mb-3">
                Renueva tu paquete o explora otros talleres.
              </p>
              <Link
                href="/talleres"
                className="inline-flex items-center gap-1 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 px-4 py-2.5 rounded-lg transition-colors"
              >
                Explorar talleres →
              </Link>
            </>
          ) : (
            // Solo tiene clase de prueba — los detalles ya se ven en su card de "Mis talleres"
            <p className="text-sm text-gray-600 mt-1">Tu clase de prueba aparece en “Mis talleres” con todos los detalles.</p>
          )}
        </div>
      ) : (
        // Estado: sin ningún taller → bienvenida con CTA explorar
        <div className="bg-purple-50 border border-purple-100 rounded-2xl px-5 py-8 text-center">
          <p className="text-3xl mb-2">🎨</p>
          <p className="font-bold text-gray-900 text-lg mb-1">¡Bienvenido/a a Tallerea!</p>
          <p className="text-sm text-gray-500 mb-4">Aún no tienes talleres. Explora y encuentra el tuyo.</p>
          <Link
            href="/talleres"
            className="inline-flex items-center gap-1 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 px-5 py-2.5 rounded-lg transition-colors"
          >
            Explorar talleres →
          </Link>
        </div>
      )}


      {/* Mis talleres: suscripciones activas + clases de prueba unificadas */}
      {(subscriptions.length > 0 || clasesPrueba.length > 0) && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Mis talleres</h2>
          <div className="space-y-3">
            {subscriptions.map(s => {
              const prepaid = s.clasesPrepagadas
              const prepaidActivo = prepaid && prepaid.consumidas < prepaid.cantidad
              const wMedia = s.workshopId as unknown as WorkshopWithMedia
              const devueltas = cancelledByProf.filter(b => (b.workshopId as WorkshopRef).slug === wMedia.slug).length
              const disponibles = prepaidActivo ? (prepaid!.cantidad - prepaid!.consumidas) : s.sesionesDisponibles
              const profesorNombre = profMap.get(String(wMedia.ownerId)) ?? 'Tallerista'
              const proxBooking = bookingBySub.get(String(s._id))
              const proxSlot = proxBooking ? (proxBooking.workshopId as WorkshopWithSlots).slots?.[proxBooking.slotIndex] : undefined
              // Si esta sub es la del hero superior, ocultar fecha aquí para evitar duplicación
              const isHeroBooking = proximaBooking !== null && String(proximaBooking.subscriptionId) === String(s._id)
              return (
                <TallerCard
                  key={String(s._id)}
                  titulo={wMedia.titulo}
                  slug={wMedia.slug}
                  imageUrl={wMedia.imagenes?.[0]}
                  profesorNombre={profesorNombre}
                  clasesRestantes={disponibles}
                  sesionesTotales={s.sesionesTotales}
                  fechaVencimiento={s.fechaVencimiento}
                  caducaEn={prepaid?.caducaEn}
                  subscriptionId={String(s._id)}
                  proximaBooking={proxBooking && proxSlot ? { horaInicio: proxSlot.horaInicio, horaFin: proxSlot.horaFin, fecha: proxBooking.fecha } : null}
                  hideProximaBooking={isHeroBooking}
                  devueltas={devueltas}
                />
              )
            })}
            {clasesPrueba.map(cp => (
              <TallerCard
                key={cp.enrollmentId}
                titulo={cp.titulo}
                slug={cp.slug}
                profesorNombre={cp.profesorNombre}
                esClasePrueba
                horaInicioSlot={cp.horaInicio || undefined}
                horaFinSlot={cp.horaFin || undefined}
                fechaSlotStr={cp.fechaSlot}
                diaSemana={cp.diaSemana || undefined}
                montoPagado={cp.monto}
              />
            ))}
          </div>
        </section>
      )}

      {/* Footer: accesos secundarios */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs text-gray-400">
        <Link href="/talleres" className="hover:text-purple-600 transition-colors">Explorar más talleres →</Link>
        <Link href="/alumno/historial" className="hover:text-purple-600 transition-colors">Ver historial completo →</Link>
      </div>
    </div>
  )
}
