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
import SaldoTooltipButton from '@/components/SaldoTooltipButton'
import { shouldHideTrial } from '@/lib/trialFilters'
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

async function resolveClasePrueba(
  enrolls: EnrollmentLean[],
  slugsConSubHistorica: Set<string>,
): Promise<ClasePruebaDetail[]> {
  const pruebas = enrolls.filter(e => (e as unknown as { esClasePrueba?: boolean }).esClasePrueba)
  const now = Date.now()
  const details: ClasePruebaDetail[] = []
  for (const e of pruebas) {
    try {
      const w = e.workshopId as WorkshopRef | null
      if (!w?.slug) continue
      // Si ya tuvo (o tiene) suscripción al mismo taller, la prueba ya cumplió su función → ocultar
      if (slugsConSubHistorica.has(w.slug)) continue
      const wDoc = await Workshop.findOne({ slug: w.slug })
        .select('ownerId locationId slots')
        .lean<{ ownerId: Types.ObjectId; locationId?: Types.ObjectId; slots: SlotInfo[] }>()
      if (!wDoc) continue
      const slot: SlotInfo | undefined = e.slotIndex != null ? wDoc.slots[e.slotIndex] : undefined
      // Filtrar pruebas consumidas usando helper puro (testeado en trialFilters.test.ts)
      const oculta = shouldHideTrial(
        { workshopSlug: w.slug, slotFecha: slot?.fecha, enrollmentCreatedAt: e.createdAt },
        { slugsConSubHistorica, now },
      )
      if (oculta) continue
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

async function resolvePuntualSessions(enrolls: EnrollmentLean[]): Promise<ClasePruebaDetail[]> {
  const puntuales = enrolls.filter(e => !(e as unknown as { esClasePrueba?: boolean }).esClasePrueba)
  const now = new Date()
  const details: ClasePruebaDetail[] = []
  for (const e of puntuales) {
    try {
      const w = e.workshopId as WorkshopRef | null
      if (!w?.slug) continue
      const wDoc = await Workshop.findOne({ slug: w.slug })
        .select('ownerId locationId slots')
        .lean<{ ownerId: Types.ObjectId; locationId?: Types.ObjectId; slots: SlotInfo[] }>()
      if (!wDoc) continue
      const slot: SlotInfo | undefined = e.slotIndex != null ? wDoc.slots[e.slotIndex] : undefined
      // Si tiene fecha concreta y ya pasó, no mostrar
      if (slot?.fecha && new Date(slot.fecha) < now) continue
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
        direccion: loc ? `${loc.direccion}, ${loc.comuna}` : null,
        monto: e.monto,
        enrollmentId: String(e._id),
      })
    } catch {
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

  const [user, enrollments, subscriptions, upcomingBookings, cancelledByProf, allSubsHistorical] = await Promise.all([
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
    // Subs históricas (cualquier estado) — solo para filtrar pruebas cuyo upgrade ya ocurrió
    Subscription.find({ studentId, activo: true })
      .select('workshopId')
      .populate('workshopId', 'slug')
      .lean<{ workshopId: { slug: string } | null }[]>(),
  ])

  const slugsConSubHistorica = new Set(
    allSubsHistorical
      .map(s => s.workshopId?.slug)
      .filter((slug): slug is string => Boolean(slug))
  )

  const [clasesPrueba, puntualSessions] = await Promise.all([
    resolveClasePrueba(enrollments, slugsConSubHistorica).catch((err) => {
      console.error('[alumno] Error cargando detalles de clase de prueba:', err)
      return [] as ClasePruebaDetail[]
    }),
    resolvePuntualSessions(enrollments).catch((err) => {
      console.error('[alumno] Error cargando sesiones puntuales:', err)
      return [] as ClasePruebaDetail[]
    }),
  ])

  const proximaPuntual = puntualSessions[0] ?? null

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
  const hasActiveTalleres = subscriptions.length > 0 || clasesPrueba.length > 0 || puntualSessions.length > 0
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

  // Hero: elegir la sesión más cercana entre recurrente (booking) y puntual
  const fechaBookingMs = proximaFecha ? proximaFecha.getTime() : Infinity
  const fechaPuntualMs = proximaPuntual?.fechaSlot
    ? new Date(proximaPuntual.fechaSlot + 'T12:00:00').getTime()
    : Infinity
  const heroEsRecurrente = proximaBooking !== null && fechaBookingMs <= fechaPuntualMs
  const heroEsPuntual = !heroEsRecurrente && proximaPuntual !== null

  // Nombre del profesor para hero recurrente (buscar en profMap via subscription)
  let heroRecProfNombre: string | null = null
  if (heroEsRecurrente && proximaBooking) {
    const subForBooking = subscriptions.find(s => String(s._id) === String(proximaBooking!.subscriptionId))
    if (subForBooking) {
      const wMedia = subForBooking.workshopId as unknown as WorkshopWithMedia
      heroRecProfNombre = profMap.get(String(wMedia.ownerId)) ?? null
    }
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
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">💰</span>
              <p className="text-sm font-semibold text-green-800 uppercase tracking-wide">Saldo a favor</p>
            </div>
            {/* Tooltip accesible — funciona con hover, focus y tap (mobile) */}
            <div className="relative group inline-flex items-center shrink-0">
              <SaldoTooltipButton />
              <div
                role="tooltip"
                className="absolute bottom-full right-0 mb-2 w-64 bg-gray-800 text-white text-xs rounded-lg px-3 py-2.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none transition-opacity z-20 shadow-lg"
              >
                El saldo a favor son CLP que te devolvimos por una cancelación. Solo sirve para comprar nuevos talleres o paquetes — no se puede usar para pagar clases ya inscritas.
                <div className="absolute top-full right-3 border-4 border-transparent border-t-gray-800" />
              </div>
            </div>
          </div>
          <p className="text-3xl font-bold text-green-800 leading-tight">
            ${(user?.creditoDisponible ?? 0).toLocaleString('es-CL')}
            <span className="text-base font-normal text-green-600 ml-1">CLP</span>
          </p>
          <p className="text-xs text-green-700 mt-2 leading-relaxed">
            Es dinero a tu favor por una devolución. Se descuenta automáticamente cuando compres tu próximo taller.{' '}
            <span className="font-medium">No sirve para pagar clases ya inscritas.</span>
          </p>
          <div className="flex gap-2 mt-3">
            <Link
              href="/talleres"
              className="flex-1 text-center text-xs font-semibold text-white bg-green-700 hover:bg-green-800 py-2 rounded-lg transition-colors"
            >
              Explorar talleres
            </Link>
            <Link
              href="/alumno/credito"
              className="flex-1 text-center text-xs font-semibold text-green-800 border border-green-300 hover:bg-green-100 py-2 rounded-lg transition-colors"
            >
              Ver historial
            </Link>
          </div>
        </div>
      )}

      {/* Hero unificado: sesión más próxima (recurrente o puntual) */}
      {(heroEsRecurrente || heroEsPuntual) ? (
        <div className="relative overflow-hidden bg-gradient-to-br from-purple-700 via-purple-600 to-indigo-600 rounded-2xl p-6 text-white shadow-xl">
          {/* Decoración de fondo */}
          <div className="absolute -top-10 -right-10 w-52 h-52 bg-white/5 rounded-full pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-indigo-400/10 rounded-full pointer-events-none" />

          {/* Badge */}
          <span className="relative inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/20 text-white text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
            Próxima sesión
          </span>

          {/* Título del taller */}
          <h2 className="relative text-2xl font-extrabold leading-tight tracking-tight">
            {heroEsRecurrente ? proximaWorkshop!.titulo : proximaPuntual!.titulo}
          </h2>

          {/* Horario */}
          {(heroEsRecurrente ? proximaSlot?.horaInicio : proximaPuntual!.horaInicio) && (
            <p className="relative text-5xl font-black tabular-nums mt-4 mb-1 leading-none tracking-tight">
              {heroEsRecurrente ? proximaSlot!.horaInicio : proximaPuntual!.horaInicio}
              <span className="text-purple-300 font-light mx-2">–</span>
              {heroEsRecurrente ? proximaSlot!.horaFin : proximaPuntual!.horaFin}
            </p>
          )}

          {/* Fecha */}
          <p className="relative text-purple-200 text-base capitalize mt-2 font-medium">
            {heroEsRecurrente
              ? proximaFecha!.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
              : proximaPuntual!.fechaSlot
                ? new Date(proximaPuntual!.fechaSlot + 'T12:00:00').toLocaleDateString('es-CL', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                  })
                : (proximaPuntual!.diaSemana ?? '')}
          </p>

          {/* Profesor + ubicación */}
          <div className="relative mt-5 pt-5 border-t border-white/20 flex flex-wrap gap-x-5 gap-y-2">
            {(heroEsRecurrente ? heroRecProfNombre : proximaPuntual!.profesorNombre) && (
              <div className="flex items-center gap-2 text-sm text-purple-100">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 text-purple-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
                <span className="font-medium">{heroEsRecurrente ? heroRecProfNombre : proximaPuntual!.profesorNombre}</span>
              </div>
            )}
            {!heroEsRecurrente && proximaPuntual!.direccion && (
              <div className="flex items-center gap-2 text-sm text-purple-100">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 text-purple-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                <span>{proximaPuntual!.direccion}</span>
              </div>
            )}
          </div>

          {/* CTA: cancelar booking (recurrente) vs ver taller (puntual) */}
          <div className="relative mt-5 flex flex-wrap items-center gap-3">
            {heroEsRecurrente ? (
              <>
                <CancelBookingButton bookingId={String(proximaBooking!._id)} />
                {otrasBookingsCount > 0 && (
                  <p className="text-xs text-purple-200">
                    + {otrasBookingsCount} {otrasBookingsCount === 1 ? 'clase reservada' : 'clases reservadas'} más
                  </p>
                )}
              </>
            ) : (
              <Link
                href={`/talleres/${proximaPuntual!.slug}`}
                className="inline-flex items-center gap-2 bg-white text-purple-700 font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-purple-50 active:bg-purple-100 transition-colors shadow-md"
              >
                Ver detalles del taller
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            )}
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


      {/* Mis talleres: suscripciones + puntuales + clases de prueba (resumen) */}
      {(subscriptions.length > 0 || clasesPrueba.length > 0 || puntualSessions.length > 0) && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Mis talleres</h2>
            <Link href="/alumno/mis-talleres" className="text-xs font-medium text-purple-600 hover:text-purple-800">Ver todos →</Link>
          </div>
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
            {puntualSessions.map(ps => (
              <TallerCard
                key={ps.enrollmentId}
                titulo={ps.titulo}
                slug={ps.slug}
                profesorNombre={ps.profesorNombre}
                esPuntual
                horaInicioSlot={ps.horaInicio || undefined}
                horaFinSlot={ps.horaFin || undefined}
                fechaSlotStr={ps.fechaSlot}
                diaSemana={ps.diaSemana || undefined}
                montoPagado={ps.monto}
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
