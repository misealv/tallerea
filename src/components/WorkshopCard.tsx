import Link from 'next/link'
import Image from 'next/image'

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
  slots?: { dia?: string; horaInicio: string }[]
  espacioNombre?: string
  espacioSlug?: string
  talleristaNombre?: string   // nombre del owner
  clasePruebaDisponible?: boolean
  clasePruebaPrecio?: number  // 0 = gratis
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
  talleristaNombre, clasePruebaDisponible, clasePruebaPrecio,
}: WorkshopCardProps) {
  const displaySlots = (slots && slots.length > 0) ? slots : horarios
  const precioMostrar = precioDesde ?? precio
  const esGratis = precioMostrar === 0

  return (
    <Link href={`/talleres/${slug}`} className="group block bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
      {/* Imagen */}
      <div className="h-44 bg-gray-100 flex items-center justify-center text-5xl relative">
        {imagen
          ? <Image src={imagen} alt={titulo} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
          : tipoIcon[tipo] || '✨'}

        {/* Badge clase de prueba */}
        {clasePruebaDisponible && (
          <span className="absolute top-2 left-2 bg-purple-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full shadow">
            {clasePruebaPrecio === 0 ? '🎁 Prueba gratis' : '🎟️ Clase de prueba'}
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

        {displaySlots && displaySlots.length > 0 && (
          <p className="text-xs text-gray-500">
            {displaySlots.map(h => `${h.dia} ${h.horaInicio}`).slice(0, 2).join(' · ')}
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
