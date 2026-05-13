import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BookingService, UpcomingBookingDetail } from '@/services/BookingService'
import CancelBookingButton from '@/components/CancelBookingButton'

export const dynamic = 'force-dynamic'

// YYYY-MM-DD del día en zona Santiago (sin dependencias)
function toYMDCL(d: Date): string {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
}

function formatHora(iso: string): string { return iso.slice(0, 5) }

function getDayLabel(ymd: string): string {
  const todayYMD    = toYMDCL(new Date())
  const nextDay     = new Date()
  nextDay.setDate(nextDay.getDate() + 1)
  const tomorrowYMD = toYMDCL(nextDay)

  const dateCL = new Date(`${ymd}T00:00:00-03:00`)
  const formatted = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'America/Santiago',
  }).format(dateCL)
  const cap = formatted.charAt(0).toUpperCase() + formatted.slice(1)

  if (ymd === todayYMD)    return `HOY · ${cap}`
  if (ymd === tomorrowYMD) return `MAÑANA · ${cap}`
  return cap
}

const MODALIDAD_BADGE: Record<string, string> = {
  presencial: 'bg-green-100 text-green-700',
  online:     'bg-blue-100 text-blue-700',
  hibrido:    'bg-purple-100 text-purple-700',
}

const TIPO_EMOJI: Record<string, string> = {
  visual: '🎨', teatro: '🎭', danza: '💃', musica: '🎵',
  escritura: '✍️', cocina: '🍳', manualidades: '🧵', otro: '⭐',
}

function ReservaCard({ b }: { b: UpcomingBookingDetail }) {
  const yaPaso = new Date(b.fecha) < new Date()
  const reagendPendiente = b.reagendamiento?.estado === 'pendiente'

  return (
    <div className={`bg-white border rounded-xl p-4 flex flex-col gap-3 ${
      yaPaso ? 'opacity-60 border-gray-200' : 'border-gray-200'
    }`}>
      {/* Cabecera: título + badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {b.workshopTipo && (
              <span className="text-base">{TIPO_EMOJI[b.workshopTipo] ?? '⭐'}</span>
            )}
            <Link
              href={`/talleres/${b.workshopSlug}`}
              className="font-semibold text-gray-900 hover:text-purple-700 text-sm truncate"
            >
              {b.workshopTitulo}
            </Link>
          </div>
          {b.talleristaNombre && (
            <p className="text-xs text-gray-500 mt-0.5">con {b.talleristaNombre}</p>
          )}
          {b.dependentNombre && (
            <p className="text-xs text-purple-600 mt-0.5">👤 Para {b.dependentNombre}</p>
          )}
        </div>

        {/* Hora */}
        <div className="shrink-0 text-right">
          <span className="font-mono text-sm font-semibold text-gray-800">
            {formatHora(b.horaInicio)} – {formatHora(b.horaFin)}
          </span>
        </div>
      </div>

      {/* Modalidad + ubicación */}
      <div className="flex items-center gap-2 flex-wrap">
        {b.workshopModalidad && (
          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${MODALIDAD_BADGE[b.workshopModalidad] ?? 'bg-gray-100 text-gray-600'}`}>
            {b.workshopModalidad}
          </span>
        )}
        {b.workshopModalidad === 'presencial' && b.location && (
          <span className="text-xs text-gray-500">
            📍 {b.location.nombre} · {b.location.comuna}
          </span>
        )}
        {b.workshopModalidad === 'online' && (
          <span className="text-xs text-gray-500">💻 Sesión en línea</span>
        )}
      </div>

      {/* Alertas */}
      {reagendPendiente && (
        <p className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-lg">
          ⚠️ Tienes un reagendamiento pendiente de aprobación por el tallerista.
        </p>
      )}
      {b.cancelado && (
        <p className="text-xs bg-red-50 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg">
          Esta sesión fue cancelada por el tallerista.
        </p>
      )}

      {/* Acciones */}
      {!yaPaso && !b.cancelado && (
        <div className="flex items-center gap-3 pt-1">
          <CancelBookingButton bookingId={b.bookingId} />
          {!reagendPendiente && (
            <Link
              href={`/alumno/reservas?sub=${b.subscriptionId}&workshop=${b.workshopSlug}`}
              className="text-xs border border-gray-200 text-gray-600 hover:border-purple-300 hover:text-purple-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              Reagendar
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

export default async function MisReservasPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/alumno/acceso')

  const reservas = await BookingService.getDetailedUpcomingByStudent(session.user.id)

  // Agrupar por fecha civil Santiago
  const byDay = new Map<string, UpcomingBookingDetail[]>()
  for (const b of reservas) {
    const ymd = toYMDCL(new Date(b.fecha))
    const arr = byDay.get(ymd) ?? []
    arr.push(b)
    byDay.set(ymd, arr)
  }
  const days = Array.from(byDay.entries()).sort(([a], [b]) => (a < b ? -1 : 1))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis reservas</h1>
          <p className="text-sm text-gray-500 mt-1">Tus próximas clases confirmadas.</p>
        </div>
        <Link href="/alumno/mis-talleres" className="text-xs text-purple-600 hover:underline">
          Ver mis talleres →
        </Link>
      </div>

      {days.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
          <p className="text-gray-400 text-sm">No tienes clases reservadas próximamente.</p>
          <Link
            href="/talleres"
            className="mt-4 inline-block bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg"
          >
            Explorar talleres
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {days.map(([fecha, dayBookings]) => (
            <div key={fecha}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                {getDayLabel(fecha)}
              </p>
              <div className="space-y-3">
                {dayBookings.map(b => (
                  <ReservaCard key={b.bookingId} b={b} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
