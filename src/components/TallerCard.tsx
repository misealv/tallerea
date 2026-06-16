'use client'

import Link from 'next/link'
import Image from 'next/image'
import { getCloudinaryUrl, TRANSFORM } from '@/lib/cloudinary-transform'
import { trackTallerCardClick, trackTooltipClasesOpen } from '@/lib/analytics'

export interface TallerCardProps {
  titulo: string
  slug: string
  imageUrl?: string
  profesorNombre: string
  // Subscription
  clasesRestantes?: number
  sesionesTotales?: number
  fechaVencimiento?: Date
  caducaEn?: Date
  subscriptionId?: string
  // Próxima clase reservada
  proximaBooking?: { horaInicio: string; horaFin: string; fecha: Date } | null
  /** Si la próxima clase de esta suscripción ya se muestra en el hero superior, ocultar aquí */
  hideProximaBooking?: boolean
  // Alertas
  devueltas?: number
  // Clase de prueba
  esClasePrueba?: boolean
  // Inscripción puntual (sesión única ya pagada, no recurrente)
  esPuntual?: boolean
  horaInicioSlot?: string
  horaFinSlot?: string
  fechaSlotStr?: string | null
  diaSemana?: string | null
  montoPagado?: number
  // Dependiente asignado a la suscripción
  dependentNombre?: string
  // ID del workshop — necesario para el link de recarga cuando sesiones = 0
  workshopId?: string
}

export default function TallerCard({
  titulo,
  slug,
  imageUrl,
  profesorNombre,
  clasesRestantes = 0,
  fechaVencimiento,
  caducaEn,
  subscriptionId,
  proximaBooking,
  hideProximaBooking = false,
  devueltas = 0,
  esClasePrueba = false,
  esPuntual = false,
  horaInicioSlot,
  horaFinSlot,
  fechaSlotStr,
  diaSemana,
  montoPagado,
  dependentNombre,
  workshopId,
}: TallerCardProps) {
  const thumbUrl = getCloudinaryUrl(imageUrl, TRANSFORM.dashboardCard)
  const hasCaducado = caducaEn ? new Date(caducaEn) < new Date() : false

  // Tipo para analítica de clic (Fase 8)
  const tipoCard: 'puntual' | 'recurrente' | 'prueba' = esClasePrueba
    ? 'prueba'
    : esPuntual
      ? 'puntual'
      : subscriptionId
        ? 'recurrente'
        : 'puntual'
  const onCardClick = () => trackTallerCardClick(tipoCard, slug)

  return (
    <div className={`bg-white rounded-xl border ${devueltas > 0 ? 'border-amber-300' : 'border-gray-200'}`}>
      {/* Encabezado: foto + título + profesor */}
      <div className="flex items-start gap-3 p-4 pb-3">
        {thumbUrl ? (
          <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-gray-100">
            <Image src={thumbUrl} alt={titulo} fill className="object-cover" sizes="64px" />
          </div>
        ) : (
          <div className="w-16 h-16 shrink-0 rounded-lg bg-purple-100 flex items-center justify-center text-2xl select-none">
            🎨
          </div>
        )}
        <div className="min-w-0 flex-1">
          {esClasePrueba && (
            <span className="inline-block text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full mb-1">
              🌱 Clase de prueba
            </span>
          )}
          {esPuntual && (
            <span className="inline-block text-xs font-semibold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full mb-1">
              🎫 Sesión puntual
            </span>
          )}
          <p className="font-semibold text-gray-900 text-sm leading-tight">{titulo}</p>
          {dependentNombre && (
            <p className="text-xs font-medium text-purple-600 mt-0.5">Para: {dependentNombre}</p>
          )}
          <p className="text-xs text-gray-500 mt-0.5">con {profesorNombre}</p>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-2.5">
        {/* Próxima clase reservada (solo subscriptions, oculta si ya está en hero) */}
        {!esClasePrueba && !esPuntual && proximaBooking && !hideProximaBooking && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-purple-500 shrink-0">📅</span>
            <span className="text-gray-700">
              Próxima clase:{' '}
              <span className="font-medium">
                {new Date(proximaBooking.fecha).toLocaleDateString('es-CL', {
                  weekday: 'short', day: 'numeric', month: 'short',
                })}{' '}
                · {proximaBooking.horaInicio}
              </span>
            </span>
          </div>
        )}

        {/* Horario clase de prueba o puntual */}
        {(esClasePrueba || esPuntual) && horaInicioSlot && (
          <div className="flex items-center gap-2 text-sm">
            <span className={`shrink-0 ${esPuntual ? 'text-indigo-500' : 'text-amber-500'}`}>🕐</span>
            <span className="text-gray-700">
              {diaSemana ?? ''}
              {fechaSlotStr
                ? ` ${new Date(fechaSlotStr + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}`
                : ''}{' '}
              · {horaInicioSlot} – {horaFinSlot}
            </span>
          </div>
        )}

        {/* Clases restantes + vencimiento (subscription) */}
        {!esClasePrueba && !esPuntual && (
          <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🎟️</span>
              <span className={`text-sm font-semibold ${clasesRestantes > 0 ? 'text-purple-700' : 'text-gray-400'}`}>
                {clasesRestantes} {clasesRestantes === 1 ? 'clase restante' : 'clases restantes'}
              </span>
              {/* Tooltip accesible — funciona con hover, focus y tap (mobile) */}
              <div className="relative group inline-flex items-center">
                <button
                  type="button"
                  onMouseEnter={trackTooltipClasesOpen}
                  onFocus={trackTooltipClasesOpen}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold cursor-help select-none hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-300 transition-colors"
                  aria-label="Información sobre clases pagadas"
                >?</button>
                <div
                  role="tooltip"
                  className="absolute bottom-full left-0 mb-2 w-56 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none transition-opacity z-20 shadow-lg"
                >
                  Estas clases ya están pagadas para este taller. Son distintas del saldo a favor (CLP).
                  <div className="absolute top-full left-3 border-4 border-transparent border-t-gray-800" />
                </div>
              </div>
            </div>
            {caducaEn ? (
              <span className={`text-xs ${hasCaducado ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                {hasCaducado ? 'Caducó' : 'Caduca'}{' '}
                {new Date(caducaEn).toLocaleDateString('es-CL')}
              </span>
            ) : fechaVencimiento ? (
              <span className="text-xs text-gray-400">
                válidas hasta {new Date(fechaVencimiento).toLocaleDateString('es-CL')}
              </span>
            ) : null}
          </div>
        )}

        {/* Monto pagado (clase de prueba o puntual) */}
        {(esClasePrueba || esPuntual) && montoPagado !== undefined && (
          <p className="text-xs text-gray-400">💳 Pagado: ${montoPagado.toLocaleString('es-CL')} CLP</p>
        )}

        {/* Pill devoluciones */}
        {devueltas > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
            <span>⚡</span>
            {devueltas === 1
              ? '1 clase devuelta por tu profesor — ya disponible'
              : `${devueltas} clases devueltas por tu profesor — ya disponibles`}
          </p>
        )}

        {/* CTAs */}
        {esClasePrueba ? (
          <Link
            href={`/talleres/${slug}`}
            onClick={onCardClick}
            className="flex items-center justify-center text-sm font-semibold text-purple-700 border border-purple-200 bg-purple-50 hover:bg-purple-100 py-2.5 rounded-lg transition-colors"
          >
            Suscribirme al taller completo →
          </Link>
        ) : esPuntual ? (
          <Link
            href={`/talleres/${slug}`}
            onClick={onCardClick}
            className="flex items-center justify-center text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 py-2.5 rounded-lg transition-colors"
          >
            Ver detalles del taller →
          </Link>
        ) : clasesRestantes > 0 ? (
            <Link
              href={
                subscriptionId
                  ? `/alumno/reservas?sub=${subscriptionId}&workshop=${encodeURIComponent(slug)}`
                  : `/talleres/${slug}`
              }
              onClick={onCardClick}
              className="flex items-center justify-center text-sm font-semibold text-white py-2.5 rounded-lg transition-colors bg-purple-600 hover:bg-purple-700 active:bg-purple-800"
            >
              Reservar otra clase
            </Link>
          ) : (
            <Link
              href={workshopId ? `/alumno/mis-talleres/${workshopId}/recargar` : `/talleres/${slug}`}
              onClick={onCardClick}
              className="flex items-center justify-center text-sm font-semibold text-white py-2.5 rounded-lg transition-colors bg-orange-500 hover:bg-orange-600 active:bg-orange-700"
            >
              Comprar más clases
            </Link>
          )}

        {!esClasePrueba && !esPuntual && (
          <Link
            href={`/talleres/${slug}`}
            onClick={onCardClick}
            className="flex items-center justify-center text-xs text-gray-400 hover:text-purple-600 transition-colors py-1"
          >
            Ver detalles del taller
          </Link>
        )}
      </div>
    </div>
  )
}
