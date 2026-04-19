import Link from 'next/link'
import Image from 'next/image'

interface WorkshopCardProps {
  slug: string
  titulo: string
  tipo: string
  modalidad: string
  precio: number
  cupoDisponible: number
  comuna?: string
  imagen?: string
  horarios?: { dia: string; horaInicio: string }[]
  slots?: { dia: string; horaInicio: string; cupoDisponible?: number }[]
  espacioNombre?: string
  espacioSlug?: string
}

const tipoIcon: Record<string, string> = {
  visual: '🎨', teatro: '🎭', danza: '💃', musica: '🎵', otro: '✨',
}

const modalidadLabel: Record<string, string> = {
  presencial: 'Presencial', online: 'Online', hibrido: 'Híbrido',
}

export default function WorkshopCard({
  slug, titulo, tipo, modalidad, precio, cupoDisponible,
  comuna, imagen, horarios, slots, espacioNombre, espacioSlug,
}: WorkshopCardProps) {
  const hasSlots = slots && slots.length > 0
  const totalCupos = hasSlots
    ? slots.reduce((s, sl) => s + (sl.cupoDisponible ?? 0), 0)
    : cupoDisponible
  const displaySlots = hasSlots ? slots : horarios
  return (
    <Link href={`/talleres/${slug}`} className="group block bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
      {/* Imagen */}
      <div className="h-44 bg-gray-100 flex items-center justify-center text-5xl relative">
        {imagen
          ? <Image src={imagen} alt={titulo} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
          : tipoIcon[tipo] || '✨'}
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

        {displaySlots && displaySlots.length > 0 && (
          <p className="text-xs text-gray-500">
            {displaySlots.map(h => `${h.dia} ${h.horaInicio}`).slice(0, 2).join(' · ')}
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-lg font-bold text-purple-700">
            {precio === 0 ? 'Gratis' : `$${precio.toLocaleString('es-CL')}`}
          </span>
          <span className={`text-xs px-2 py-1 rounded-full ${totalCupos > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {totalCupos > 0 ? `${totalCupos} cupos` : 'Sin cupos'}
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
