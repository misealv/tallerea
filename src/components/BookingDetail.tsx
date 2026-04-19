'use client'

const DIA_LABEL: Record<string, string> = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
  viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
}

const estadoConfig: Record<string, { bg: string; label: string }> = {
  reservada: { bg: 'bg-blue-100 text-blue-700', label: 'Reservada' },
  asistio: { bg: 'bg-green-100 text-green-700', label: 'Asistió' },
  no_asistio: { bg: 'bg-red-100 text-red-600', label: 'No asistió' },
  cancelada: { bg: 'bg-gray-100 text-gray-500', label: 'Cancelada' },
}

interface BookingDetailProps {
  booking: {
    _id: string
    workshopId: { titulo: string; slug: string }
    fecha: string
    estado: string
    slotIndex: number
  }
  slot?: { dia: string; horaInicio: string; horaFin: string }
  onCancel: (id: string) => void
  onChangeSlot: (id: string) => void
}

export default function BookingDetail({ booking, slot, onCancel, onChangeSlot }: BookingDetailProps) {
  const fecha = new Date(booking.fecha)
  const isFuture = fecha > new Date()

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-purple-100 flex flex-col items-center justify-center">
          <span className="text-xs font-bold text-purple-700">
            {fecha.getDate()}
          </span>
          <span className="text-[10px] text-purple-500">
            {fecha.toLocaleDateString('es-CL', { month: 'short' })}
          </span>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">
            {slot ? `${DIA_LABEL[slot.dia] || slot.dia} ${slot.horaInicio}–${slot.horaFin}` : booking.workshopId.titulo}
          </p>
          <p className="text-xs text-gray-500">
            {fecha.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${estadoConfig[booking.estado]?.bg}`}>
          {estadoConfig[booking.estado]?.label}
        </span>
        {booking.estado === 'reservada' && isFuture && (
          <>
            <button
              onClick={() => onChangeSlot(booking._id)}
              className="text-xs text-purple-600 hover:underline"
            >
              Cambiar
            </button>
            <button
              onClick={() => onCancel(booking._id)}
              className="text-xs text-red-500 hover:underline"
            >
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
