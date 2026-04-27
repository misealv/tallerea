import Link from 'next/link'
import Image from 'next/image'
import { getCloudinaryUrl, TRANSFORM } from '@/lib/cloudinary-transform'

interface WorkshopCardProps {
  slug: string
  titulo: string
  tipo: string
  modalidad: string
  precio: number
  precioDesde?: number        // precio mínimo entre todas las opciones
  cupoPorSesion: number
  comuna?: string
  imagen?: string
  horarios?: { dia?: string; horaInicio: string }[]
  slots?: { dia?: string; horaInicio: string; horaFin?: string; fecha?: string | Date }[]
  espacioNombre?: string
  espacioSlug?: string
  talleristaNombre?: string   // nombre del owner
  clasePruebaDisponible?: boolean
  clasePruebaPrecio?: number  // 0 = gratis
  modeloAcceso?: 'puntual' | 'recurrente'
  priority?: boolean          // true para las primeras cards (LCP)
}

const tipoIcon: Record<string, string> = {
  visual: '🎨', teatro: '🎭', danza: '💃', musica: '🎵',
  ceramica: '🏺', yoga: '🧘', cocina: '🍳', manualidades: '✂️',
  fotografia: '📷', escritura: '✍️', bienestar: '🌿',
  tecnologia: '💻', idiomas: '🗣️', infantil: '🧸', otro: '✨',
}

const modalidadLabel: Record<string, string> = {
  presencial: 'Presencial', online: 'Online', hibrido: 'Híbrido',
}

export default function WorkshopCard({
  slug, titulo, tipo, modalidad, precio, precioDesde, cupoPorSesion,
  comuna, imagen, horarios, slots, espacioNombre, espacioSlug,
  talleristaNombre, clasePruebaDisponible, clasePruebaPrecio, modeloAcceso, priority = false,
}: WorkshopCardProps) {
  const displaySlots = (slots && slots.length > 0) ? slots : horarios
  const precioMostrar = precioDesde ?? precio
  const esGratis = precioMostrar === 0

  // Para puntual: extraer fecha y hora del primer slot
  const slotPuntual = modeloAcceso === 'puntual' && slots && slots.length > 0 ? slots[0] : null
  const fechaPuntualLabel = slotPuntual?.fecha
    ? new Date(slotPuntual.fecha).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    : null
  const horaPuntualLabel = slotPuntual?.horaInicio
    ? slotPuntual.horaFin
      ? `${slotPuntual.horaInicio} – ${slotPuntual.horaFin} hrs`
      : `${slotPuntual.horaInicio} hrs`
    : null

  return (
    <Link href={`/talleres/${slug}`} className="group block bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-xl hover:-translate-y-1 hover:border-purple-200 transition-all duration-300">
      {/* Imagen */}
      <div className="h-44 bg-gray-100 flex items-center justify-center text-5xl relative overflow-hidden">
        {imagen
          ? <Image src={getCloudinaryUrl(imagen, TRANSFORM.card) ?? imagen} alt={titulo} fill className="object-cover group-hover:scale-105 transition-transform duration-500" sizes="(max-width: 768px) 100vw, 33vw" priority={priority} />
          : <span className="group-hover:scale-110 transition-transform duration-300 inline-block">{tipoIcon[tipo] || '✨'}</span>}

        {/* Overlay oscuro con CTA al hacer hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-300 flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white text-purple-700 text-xs font-semibold px-4 py-1.5 rounded-full shadow-lg">
            Ver taller →
          </span>
        </div>

        {/* Badge clase de prueba */}
        {clasePruebaDisponible && (
          <span className="absolute top-2 left-2 bg-purple-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full shadow">
            {clasePruebaPrecio === 0 ? '🎁 Prueba gratis' : '🎟️ Clase de prueba'}
          </span>
        )}

        {/* Badge sesión única — izquierda, apilado bajo prueba si ambos existen */}
        {modeloAcceso === 'puntual' && (
          <span className={`absolute ${clasePruebaDisponible ? 'top-8' : 'top-2'} left-2 bg-amber-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full shadow`}>
            📅 Sesión única
          </span>
        )}
      </div>

      {/* Contenido */}
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{tipoIcon[tipo]} {tipo}</span>
          <span>·</span>
          <span>{modalidadLabel[modalidad]}</span>
          {comuna && <><span>·</span><span>{comuna}</span></>}
        </div>

        <h3 className="font-semibold text-gray-900 group-hover:text-purple-700 transition-colors line-clamp-2">
          {titulo}
        </h3>

        {/* Nombre del tallerista */}
        {talleristaNombre && (
          <p className="text-xs text-gray-500">por <span className="font-medium text-gray-700">{talleristaNombre}</span></p>
        )}

        {/* Fecha y hora — solo puntual */}
        {fechaPuntualLabel && (
          <p className="text-xs font-medium text-amber-700 bg-amber-50 rounded-md px-2 py-1">
            📅 {fechaPuntualLabel}{horaPuntualLabel && <span className="text-gray-500"> · {horaPuntualLabel}</span>}
          </p>
        )}

        {/* Horarios recurrentes */}
        {!fechaPuntualLabel && displaySlots && displaySlots.length > 0 && (
          <p className="text-xs text-gray-500">
            {displaySlots.map(h => h.dia ? `${h.dia} ${h.horaInicio}` : h.horaInicio).slice(0, 2).join(' · ')}
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <div>
            {!esGratis && (
              <p className="text-[10px] text-gray-400 leading-none mb-0.5">Precio desde</p>
            )}
            <span className="text-lg font-bold text-purple-700">
              {esGratis ? 'Gratis' : `$${precioMostrar.toLocaleString('es-CL')}`}
            </span>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${cupoPorSesion > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {cupoPorSesion > 0 ? `${cupoPorSesion} cupos/sesión` : 'Sin cupos'}
          </span>
        </div>

        {espacioNombre && (
          <p className="text-xs text-gray-400 pt-1">
            por {espacioSlug
              ? <span className="hover:text-purple-600">{espacioNombre}</span>
              : espacioNombre}
          </p>
        )}
      </div>
    </Link>
  )
}
