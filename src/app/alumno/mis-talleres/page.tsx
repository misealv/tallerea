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
import TallerCard from '@/components/TallerCard'
import { shouldHideTrial } from '@/lib/trialFilters'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

interface WorkshopRef { titulo: string; slug: string; _id: Types.ObjectId }
interface WorkshopWithMedia { titulo: string; slug: string; imagenes: string[]; ownerId: Types.ObjectId; _id: Types.ObjectId }
interface WorkshopWithSlots { titulo: string; slug: string; slots: Array<{ horaInicio: string; horaFin: string; cancelado?: boolean }> }
interface OwnerRef { name: string }
interface LocationRef { nombre: string; direccion: string; comuna: string; ciudad: string }
interface SlotInfo { dia?: string; horaInicio: string; horaFin: string; fecha?: Date }

interface SesionDetail {
  titulo: string
  slug: string
  workshopId: string
  horaInicio: string
  horaFin: string
  fechaSlot: string | null
  diaSemana: string | null
  profesorNombre: string
  direccion: string | null
  monto: number
  enrollmentId: string
  esClasePrueba: boolean
}

interface EnrollmentLean {
  _id: Types.ObjectId
  workshopId: WorkshopRef
  estado: string
  monto: number
  slotIndex: number | null
  esClasePrueba?: boolean
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

async function resolveSesiones(
  enrolls: EnrollmentLean[],
  slugsConSubHistorica: Set<string>,
): Promise<SesionDetail[]> {
  const now = Date.now()
  const details: SesionDetail[] = []
  for (const e of enrolls) {
    try {
      const w = e.workshopId as WorkshopRef | null
      if (!w?.slug) continue
      const esClasePrueba = Boolean((e as unknown as { esClasePrueba?: boolean }).esClasePrueba)
      // Si es prueba y ya tiene sub histórica del mismo taller, ocultar
      if (esClasePrueba && slugsConSubHistorica.has(w.slug)) continue

      const wDoc = await Workshop.findOne({ slug: w.slug })
        .select('ownerId locationId slots')
        .lean<{ ownerId: Types.ObjectId; locationId?: Types.ObjectId; slots: SlotInfo[] }>()
      if (!wDoc) continue
      const slot: SlotInfo | undefined = e.slotIndex != null ? wDoc.slots[e.slotIndex] : undefined

      // Filtros
      if (esClasePrueba) {
        const oculta = shouldHideTrial(
          { workshopSlug: w.slug, slotFecha: slot?.fecha, enrollmentCreatedAt: e.createdAt },
          { slugsConSubHistorica, now },
        )
        if (oculta) continue
      } else {
        // Puntual: si tiene fecha y ya pasó, ocultar
        if (slot?.fecha && new Date(slot.fecha).getTime() < now) continue
      }

      const [owner, loc] = await Promise.all([
        User.findById(wDoc.ownerId).select('name').lean<OwnerRef>(),
        wDoc.locationId ? Location.findById(wDoc.locationId).select('nombre direccion comuna ciudad').lean<LocationRef>() : null,
      ])
      details.push({
        titulo: w.titulo,
        slug: w.slug,
        workshopId: String(w._id),
        horaInicio: slot?.horaInicio ?? '',
        horaFin: slot?.horaFin ?? '',
        fechaSlot: slot?.fecha ? new Date(slot.fecha).toISOString().slice(0, 10) : null,
        diaSemana: slot?.dia ? (DIAS_LABEL[slot.dia] ?? slot.dia) : null,
        profesorNombre: owner?.name ?? 'Tallerista',
        direccion: loc ? `${loc.direccion}, ${loc.comuna}` : null,
        monto: e.monto,
        enrollmentId: String(e._id),
        esClasePrueba,
      })
    } catch {
      continue
    }
  }
  return details
}

export default async function MisTalleresPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/alumno/acceso')

  await dbConnect()
  const studentId = session.user.id

  const [enrollments, subscriptions, upcomingBookings, allSubsHistorical] = await Promise.all([
    Enrollment.find({ studentId, estado: 'pagado', activo: true })
      .populate('workshopId', 'titulo slug')
      .sort({ createdAt: -1 })
      .lean<EnrollmentLean[]>(),
    Subscription.find({ studentId, estado: 'activa', activo: true })
      .populate('workshopId', 'titulo slug imagenes ownerId')
      .sort({ fechaVencimiento: 1 })
      .lean<SubscriptionLean[]>(),
    Booking.find({ studentId, estado: 'reservada', fecha: { $gte: new Date() }, activo: true })
      .populate('workshopId', 'titulo slug slots')
      .sort({ fecha: 1 })
      .lean<BookingLean[]>(),
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

  const sesiones = await resolveSesiones(enrollments, slugsConSubHistorica).catch(() => [] as SesionDetail[])
  const clasesPrueba = sesiones.filter(s => s.esClasePrueba)
  const puntualSessions = sesiones.filter(s => !s.esClasePrueba)

  // Profesores para subscriptions
  const ownerIds = subscriptions
    .map(s => (s.workshopId as unknown as WorkshopWithMedia).ownerId)
    .filter((id): id is Types.ObjectId => Boolean(id))
  const profDocs = ownerIds.length > 0
    ? await User.find({ _id: { $in: ownerIds } }).select('name').lean<{ _id: Types.ObjectId; name: string }[]>()
    : []
  const profMap = new Map(profDocs.map(p => [String(p._id), p.name]))

  // Próxima booking por sub
  const bookingBySub = new Map<string, BookingLean>()
  for (const b of upcomingBookings) {
    const w = b.workshopId as WorkshopWithSlots
    const slot = w.slots?.[b.slotIndex]
    if (slot?.cancelado) continue
    const subId = String(b.subscriptionId)
    if (!bookingBySub.has(subId)) bookingBySub.set(subId, b)
  }

  const isEmpty = subscriptions.length === 0 && puntualSessions.length === 0 && clasesPrueba.length === 0

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <Link href="/alumno" className="text-sm text-indigo-600 hover:underline">← Volver al inicio</Link>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">Mis talleres</h1>
        <p className="text-gray-500 text-sm mt-1">Todos los talleres en los que estás inscrito.</p>
      </div>

      {isEmpty && (
        <div className="bg-purple-50 border border-purple-100 rounded-2xl px-5 py-8 text-center">
          <p className="text-3xl mb-2">🎨</p>
          <p className="font-bold text-gray-900 text-lg mb-1">Aún no tienes talleres</p>
          <p className="text-sm text-gray-500 mb-4">Explora el catálogo y encuentra el que más te guste.</p>
          <Link
            href="/talleres"
            className="inline-flex items-center gap-1 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 px-5 py-2.5 rounded-lg transition-colors"
          >
            Explorar talleres →
          </Link>
        </div>
      )}

      {/* Sección 1: Talleres recurrentes (suscripciones) */}
      {subscriptions.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">Talleres recurrentes</h2>
            <span className="text-xs text-gray-400">{subscriptions.length}</span>
          </div>
          <div className="space-y-3">
            {subscriptions.map(s => {
              const prepaid = s.clasesPrepagadas
              const prepaidActivo = prepaid && prepaid.consumidas < prepaid.cantidad
              const wMedia = s.workshopId as unknown as WorkshopWithMedia
              const disponibles = prepaidActivo ? (prepaid!.cantidad - prepaid!.consumidas) : s.sesionesDisponibles
              const profesorNombre = profMap.get(String(wMedia.ownerId)) ?? 'Tallerista'
              const proxBooking = bookingBySub.get(String(s._id))
              const proxSlot = proxBooking ? (proxBooking.workshopId as WorkshopWithSlots).slots?.[proxBooking.slotIndex] : undefined
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
                />
                <Link href={`/alumno/mis-talleres/${String(wMedia._id)}/materiales`}
                  className="text-xs text-orange-600 hover:text-orange-800 font-medium ml-1 mt-0.5 inline-block">
                  📂 Ver material del taller
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Sección 2: Sesiones puntuales */}
      {puntualSessions.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">Sesiones puntuales</h2>
            <span className="text-xs text-gray-400">{puntualSessions.length}</span>
          </div>
          <div className="space-y-3">
            {puntualSessions.map(p => (
              <div key={p.enrollmentId}>
                <TallerCard
                  titulo={p.titulo}
                  slug={p.slug}
                  profesorNombre={p.profesorNombre}
                  esPuntual
                  horaInicioSlot={p.horaInicio || undefined}
                  horaFinSlot={p.horaFin || undefined}
                  fechaSlotStr={p.fechaSlot}
                  diaSemana={p.diaSemana || undefined}
                  montoPagado={p.monto}
                />
                <Link href={`/alumno/mis-talleres/${p.workshopId}/materiales`}
                  className="text-xs text-orange-600 hover:text-orange-800 font-medium ml-1 mt-0.5 inline-block">
                  📂 Ver material del taller
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sección 3: Clases de prueba */}
      {clasesPrueba.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">Clases de prueba</h2>
            <span className="text-xs text-gray-400">{clasesPrueba.length}</span>
          </div>
          <div className="space-y-3">
            {clasesPrueba.map(cp => (
              <div key={cp.enrollmentId}>
                <TallerCard
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
                <Link href={`/alumno/mis-talleres/${cp.workshopId}/materiales`}
                  className="text-xs text-orange-600 hover:text-orange-800 font-medium ml-1 mt-0.5 inline-block">
                  📂 Ver material del taller
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer secundario */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100 text-xs text-gray-400">
        <Link href="/talleres" className="hover:text-purple-600 transition-colors">Explorar más talleres →</Link>
        <Link href="/alumno/historial" className="hover:text-purple-600 transition-colors">Ver historial completo →</Link>
      </div>
    </div>
  )
}
