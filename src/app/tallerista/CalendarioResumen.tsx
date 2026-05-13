import Link from 'next/link'
import { CalendarService, UpcomingSlot } from '@/services/CalendarService'

interface Props {
  ownerId: string
}

// YYYY-MM-DD del día actual en zona civil de Chile (sin date-fns-tz)
function getTodayCL(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
}

function getDayLabel(ymd: string, todayYMD: string): string {
  // [TZ-FIX] Parsear como mediodía UTC: garantiza que Intl formatee el día
  // correcto en Santiago tanto en UTC-3 (verano) como en UTC-4 (invierno/mayo).
  // T00:00:00-03:00 = T03:00:00Z = T23:00 del día anterior en UTC-4.
  const dateCL = new Date(`${ymd}T12:00:00Z`)
  const formatted = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Santiago',
  }).format(dateCL)

  const nextDay = new Date()
  nextDay.setDate(nextDay.getDate() + 1)
  const tomorrowStr = nextDay.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })

  if (ymd === todayYMD)    return `HOY · ${formatted}`
  if (ymd === tomorrowStr) return `MAÑANA · ${formatted}`
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

const MODALIDAD_BADGE: Record<string, string> = {
  presencial: 'bg-green-100 text-green-700',
  online:     'bg-blue-100 text-blue-700',
  hibrido:    'bg-purple-100 text-purple-700',
}

const TIPO_LABEL: Record<string, string> = {
  visual: '🎨', teatro: '🎭', danza: '💃', musica: '🎵',
  escritura: '✍️', cocina: '🍳', manualidades: '🧵', otro: '⭐',
}

function SlotCard({ slot }: { slot: UpcomingSlot }) {
  const pctOcupado = slot.cupo > 0 ? slot.reservas / slot.cupo : 0
  const cupoColor = pctOcupado >= 1 ? 'text-red-600' : pctOcupado >= 0.8 ? 'text-amber-600' : 'text-gray-600'

  return (
    <div
      className={`rounded-lg border px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
        slot.cancelado ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-200'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900 text-sm truncate">{slot.workshopTitulo}</span>
          {slot.cancelado && (
            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Cancelada</span>
          )}
          {slot.reagendamientosPendientes > 0 && !slot.cancelado && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              ⚠️ {slot.reagendamientosPendientes} reagend.
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          {slot.workshopModalidad && (
            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${MODALIDAD_BADGE[slot.workshopModalidad] ?? 'bg-gray-100 text-gray-600'}`}>
              {slot.workshopModalidad}
            </span>
          )}
          {slot.workshopTipo && (
            <span className="text-xs text-gray-500">
              {TIPO_LABEL[slot.workshopTipo] ?? ''} {slot.workshopTipo}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <span className="text-sm font-mono text-gray-700">
          {slot.horaInicio} – {slot.horaFin}
        </span>
        <span className={`text-sm font-semibold tabular-nums ${cupoColor}`}>
          👥 {slot.reservas}/{slot.cupo}
        </span>
      </div>
    </div>
  )
}

export default async function CalendarioResumen({ ownerId }: Props) {
  const todayYMD = getTodayCL()
  // [TZ-FIX] Mediodía UTC: siempre cae en el mismo día calendario en Santiago
  // sin importar si CL está en UTC-3 (verano) o UTC-4 (invierno/DST).
  // Hardcodear -03:00 falla en mayo (CLT = UTC-4) y desplaza el rango 1 día.
  const from = new Date(`${todayYMD}T12:00:00Z`)
  const to   = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000)

  const slots = await CalendarService.getUpcomingSlots({ ownerId, from, to })

  // Agrupar por fecha civil
  const byDay = new Map<string, UpcomingSlot[]>()
  for (const s of slots) {
    const arr = byDay.get(s.fecha) ?? []
    arr.push(s)
    byDay.set(s.fecha, arr)
  }
  const days = Array.from(byDay.entries()).sort(([a], [b]) => (a < b ? -1 : 1))

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">📅 Próximas sesiones</h2>
        <Link href="/tallerista/calendario" className="text-xs text-purple-600 hover:underline">
          Ver todo →
        </Link>
      </div>

      {days.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Sin sesiones en los próximos 7 días.</p>
      ) : (
        <div className="space-y-5">
          {days.map(([fecha, daySlots]) => (
            <div key={fecha}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                {getDayLabel(fecha, todayYMD)}
              </p>
              <div className="space-y-2">
                {daySlots.map(slot => (
                  <SlotCard key={`${slot.workshopId}-${slot.slotIndex}`} slot={slot} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
