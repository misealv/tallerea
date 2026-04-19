'use client'

interface SubscriptionCardProps {
  subscription: {
    _id: string
    workshopId: { _id: string; titulo: string; slug: string }
    estado: 'activa' | 'vencida' | 'cancelada'
    sesionesTotales: number
    sesionesUsadas: number
    sesionesDisponibles: number
    fechaVencimiento: string
    monto: number
  }
  onCancel: (id: string) => void
  onRenew: (id: string) => void
}

const estadoConfig: Record<string, { bg: string; label: string }> = {
  activa: { bg: 'bg-green-100 text-green-700', label: 'Activa' },
  vencida: { bg: 'bg-yellow-100 text-yellow-700', label: 'Vencida' },
  cancelada: { bg: 'bg-red-100 text-red-600', label: 'Cancelada' },
}

export default function SubscriptionCard({ subscription: sub, onCancel, onRenew }: SubscriptionCardProps) {
  const ws = sub.workshopId
  const pct = sub.sesionesTotales > 0
    ? Math.round((sub.sesionesUsadas / sub.sesionesTotales) * 100)
    : 0
  const vencimiento = new Date(sub.fechaVencimiento)
  const diasRestantes = Math.ceil((vencimiento.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex justify-between items-start mb-3">
        <div>
          <a href={`/talleres/${ws.slug}`} className="font-semibold text-gray-900 hover:text-purple-700">
            {ws.titulo}
          </a>
          <p className="text-sm text-gray-500 mt-0.5">${sub.monto.toLocaleString('es-CL')}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${estadoConfig[sub.estado]?.bg}`}>
          {estadoConfig[sub.estado]?.label}
        </span>
      </div>

      {/* Barra de progreso */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{sub.sesionesUsadas}/{sub.sesionesTotales} sesiones</span>
          <span>{sub.sesionesDisponibles} disponibles</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-purple-600 h-2 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Info de vencimiento */}
      <div className="flex items-center justify-between">
        <p className={`text-xs ${diasRestantes <= 7 ? 'text-orange-600 font-medium' : 'text-gray-500'}`}>
          {sub.estado === 'activa'
            ? diasRestantes > 0
              ? `Vence en ${diasRestantes} días`
              : 'Vence hoy'
            : `Venció el ${vencimiento.toLocaleDateString('es-CL')}`
          }
        </p>
        <div className="flex gap-2">
          {sub.estado === 'activa' && (
            <button
              onClick={() => onCancel(sub._id)}
              className="text-xs text-gray-500 hover:text-red-600"
            >
              Cancelar
            </button>
          )}
          {(sub.estado === 'vencida' || sub.estado === 'cancelada') && (
            <button
              onClick={() => onRenew(sub._id)}
              className="text-xs bg-purple-600 text-white px-3 py-1 rounded-lg hover:bg-purple-700"
            >
              Renovar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
