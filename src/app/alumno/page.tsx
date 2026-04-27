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
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

interface WorkshopRef { titulo: string; slug: string }
interface WorkshopWithSlots { titulo: string; slug: string; slots: Array<{ horaInicio: string; horaFin: string }> }
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
      .populate('workshopId', 'titulo slug')
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

      {/* Clases de prueba compradas */}
      {clasesPrueba.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Mis clases de prueba</h2>
          <div className="space-y-4">
            {clasesPrueba.map(cp => (
              <div key={cp.enrollmentId} className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 space-y-3">
                {/* Encabezado */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Clase de prueba</span>
                    <h3 className="font-bold text-gray-900 mt-0.5">{cp.titulo}</h3>
                  </div>
                  <span className="shrink-0 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Pagado</span>
                </div>
                {/* Detalles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {/* Horario */}
                  {cp.horaInicio && (
                    <div className="flex items-start gap-2">
                      <span className="text-amber-500 shrink-0">🕐</span>
                      <div>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Horario</p>
                        <p className="text-gray-800 font-medium">
                          {cp.diaSemana ?? ''}
                          {cp.fechaSlot
                            ? ` ${new Date(cp.fechaSlot + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}`
                            : ''}
                        </p>
                        <p className="text-gray-600">{cp.horaInicio} – {cp.horaFin} hrs</p>
                      </div>
                    </div>
                  )}
                  {/* Profesor */}
                  <div className="flex items-start gap-2">
                    <span className="text-amber-500 shrink-0">👤</span>
                    <div>
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Profesor/a</p>
                      <p className="text-gray-800 font-medium">{cp.profesorNombre}</p>
                    </div>
                  </div>
                  {/* Dirección */}
                  {cp.direccion && (
                    <div className="flex items-start gap-2 sm:col-span-2">
                      <span className="text-amber-500 shrink-0">📍</span>
                      <div>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Dirección</p>
                        <p className="text-gray-800">{cp.direccion}</p>
                      </div>
                    </div>
                  )}
                  {/* Precio pagado */}
                  <div className="flex items-start gap-2">
                    <span className="text-amber-500 shrink-0">💳</span>
                    <div>
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Monto pagado</p>
                      <p className="text-gray-800 font-medium">${cp.monto.toLocaleString('es-CL')}</p>
                    </div>
                  </div>
                </div>
                {/* CTA suscripción */}
                <div className="pt-1 border-t border-amber-200">
                  <Link
                    href={`/talleres/${cp.slug}`}
                    className="text-sm text-purple-700 font-semibold hover:underline"
                  >
                    Suscribirme al taller completo →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Banner: sesiones canceladas por el profesor (últimos 30 días) */}
      {cancelledByProf.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <p className="font-semibold text-amber-800 text-sm">
              Tu profesor canceló {cancelledByProf.length === 1 ? 'una sesión' : `${cancelledByProf.length} sesiones`}
            </p>
          </div>
          <div className="space-y-1.5">
            {cancelledByProf.map(b => {
              const w = b.workshopId as WorkshopRef
              const fecha = new Date(b.fecha)
              return (
                <div key={String(b._id)} className="flex items-start gap-2 text-sm text-amber-900">
                  <span className="shrink-0 text-amber-500">→</span>
                  <span>
                    <span className="font-medium">{w.titulo}</span>
                    {' — '}
                    <span className="capitalize">
                      {fecha.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </span>
                    <span className="ml-1.5 inline-flex items-center bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                      ✓ 1 sesión devuelta
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-amber-700 pt-1">
            Las sesiones devueltas ya están disponibles en tu suscripción. Puedes reservar otro horario.
          </p>
        </div>
      )}

      {/* Próximas sesiones */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Próximas sesiones</h2>
        {upcomingBookings.length === 0 ? (
          <p className="text-sm text-gray-400">
            Sin sesiones reservadas próximamente.{' '}
            {subscriptions.length > 0 && (
              <Link
                href={`/alumno/reservas?sub=${String(subscriptions[0]._id)}&workshop=${encodeURIComponent((subscriptions[0].workshopId as WorkshopRef).slug)}`}
                className="text-purple-600 underline"
              >Reserva una →</Link>
            )}
          </p>
        ) : (
          <div className="space-y-3">
            {upcomingBookings.map((b, idx) => {
              const w = b.workshopId as WorkshopWithSlots
              const slot = w.slots?.[b.slotIndex]
              const fecha = new Date(b.fecha)
              if (idx === 0) {
                return (
                  <div key={String(b._id)} className="bg-purple-600 rounded-2xl px-5 py-5 text-white">
                    <p className="text-xs font-semibold uppercase tracking-wide text-purple-200">Próxima sesión</p>
                    <p className="font-bold text-lg mt-1 leading-tight">{w.titulo}</p>
                    {slot && (
                      <p className="text-3xl font-bold mt-3 tabular-nums">{slot.horaInicio} – {slot.horaFin}</p>
                    )}
                    <p className="text-sm text-purple-200 mt-1 capitalize">
                      {fecha.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    <div className="mt-4 pt-3 border-t border-purple-500">
                      <CancelBookingButton bookingId={String(b._id)} />
                    </div>
                  </div>
                )
              }
              return (
                <div key={String(b._id)} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{w.titulo}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      <span className="capitalize">
                        {fecha.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      {slot && <span className="ml-1.5 font-medium text-gray-700">{slot.horaInicio}</span>}
                    </p>
                  </div>
                  <CancelBookingButton bookingId={String(b._id)} />
                </div>
              )
            })}
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
            {subscriptions.map(s => {
              const prepaid = s.clasesPrepagadas
              const prepaidActivo = prepaid && prepaid.consumidas < prepaid.cantidad
              const workshopRef = s.workshopId as WorkshopRef
              // Contar cancelaciones del prof en este taller (últimos 30 días)
              const devueltas = cancelledByProf.filter(b => (b.workshopId as WorkshopRef).slug === workshopRef.slug).length
              // Sesiones disponibles efectivas
              const disponibles = prepaidActivo ? (prepaid!.cantidad - prepaid!.consumidas) : s.sesionesDisponibles
              return (
              <div key={String(s._id)} className={`bg-white rounded-xl px-4 py-4 border ${devueltas > 0 ? 'border-amber-300' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-medium text-gray-900 text-sm leading-snug">{workshopRef.titulo}</p>
                  {/* Contador de sesiones disponibles */}
                  <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${disponibles > 0 ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                    {disponibles} {disponibles === 1 ? 'sesión' : 'sesiones'}
                  </span>
                </div>

                {/* Aviso devolución */}
                {devueltas > 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mb-2 flex items-center gap-1.5">
                    <span>⚡</span>
                    {devueltas === 1 ? '1 sesión devuelta por tu profesor — ya disponible' : `${devueltas} sesiones devueltas por tu profesor — ya disponibles`}
                  </p>
                )}

                {prepaidActivo ? (
                  <p className="text-xs text-gray-500 mb-3">
                    Prepagada ·{' '}
                    {prepaid!.caducaEn ? (
                      <span className={new Date(prepaid!.caducaEn) < new Date() ? 'text-red-600 font-medium' : ''}>
                        {new Date(prepaid!.caducaEn) < new Date() ? 'Caducó' : 'Caduca'} el {new Date(prepaid!.caducaEn).toLocaleDateString('es-CL')}
                      </span>
                    ) : (
                      <>Vence {new Date(s.fechaVencimiento).toLocaleDateString('es-CL')}</>
                    )}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 mb-3">
                    {s.sesionesTotales} totales · Vence {new Date(s.fechaVencimiento).toLocaleDateString('es-CL')}
                  </p>
                )}
                <Link
                  href={`/alumno/reservas?sub=${String(s._id)}&workshop=${encodeURIComponent(workshopRef.slug)}`}
                  className={`flex items-center justify-center gap-1 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors ${disponibles > 0 ? 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800' : 'bg-gray-300 cursor-not-allowed pointer-events-none'}`}
                >
                  {disponibles > 0 ? 'Reservar sesión' : 'Sin sesiones disponibles'}
                </Link>
              </div>
              )
            })}
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
            {enrollments
              .filter(e => !(e as unknown as { esClasePrueba?: boolean }).esClasePrueba)
              .map(e => (
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
