'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

// Carga diferida: el Brick de MP solo se carga cuando el usuario abre el formulario
const AutopagoActivarForm = dynamic(() => import('./AutopagoActivarForm'), {
  loading: () => <p className="text-sm text-gray-400">Cargando formulario...</p>,
})

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
    precioSnapshot?: number
    // [PAGO AUTOMÁTICO] Estado del mandato
    pagoAutomatico?: boolean
    mpPreapprovalStatus?: 'authorized' | 'paused' | 'cancelled' | 'pending'
    cardLast4?: string
    clasesPrepagadas?: { cantidad: number; consumidas: number; caducaEn?: string }
  }
  descuentoPagoAutomaticoPct?: number   // viene de SiteConfig, se pasa desde la página
  onCancel: (id: string) => void
  onRenew: (id: string) => void
}

const estadoConfig: Record<string, { bg: string; label: string }> = {
  activa: { bg: 'bg-green-100 text-green-700', label: 'Activa' },
  vencida: { bg: 'bg-yellow-100 text-yellow-700', label: 'Vencida' },
  cancelada: { bg: 'bg-red-100 text-red-600', label: 'Cancelada' },
}

export default function SubscriptionCard({ subscription: sub, descuentoPagoAutomaticoPct = 0, onCancel, onRenew }: SubscriptionCardProps) {
  const [showBrick, setShowBrick] = useState(false)
  const [autopago, setAutopago] = useState({
    activo: sub.pagoAutomatico ?? false,
    cardLast4: sub.cardLast4,
    status: sub.mpPreapprovalStatus,
  })
  const [desactivando, setDesactivando] = useState(false)

  const ws = sub.workshopId
  const pct = sub.sesionesTotales > 0
    ? Math.round((sub.sesionesUsadas / sub.sesionesTotales) * 100)
    : 0
  // Vigencia real: si hay prepago con saldo y caducaEn, esa fecha gana sobre fechaVencimiento
  const prepaid = sub.clasesPrepagadas
  const prepaidActivo = !!prepaid && prepaid.consumidas < prepaid.cantidad
  const vencimiento = prepaidActivo && prepaid!.caducaEn
    ? new Date(prepaid!.caducaEn)
    : new Date(sub.fechaVencimiento)
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

      {/* [PAGO AUTOMÁTICO] Sección de estado y activación */}
      {sub.estado === 'activa' && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          {autopago.activo ? (
            // Estado: mandato activo
            <div className="flex items-center justify-between">
              <div>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                  <span>●</span> Pago automático activo
                </span>
                {autopago.cardLast4 && (
                  <p className="text-xs text-gray-400 mt-0.5">Tarjeta terminada en {autopago.cardLast4}</p>
                )}
              </div>
              <button
                onClick={async () => {
                  setDesactivando(true)
                  try {
                    const res = await fetch(`/api/subscriptions/${sub._id}/autopago`, { method: 'DELETE' })
                    if (res.ok) setAutopago({ activo: false, cardLast4: undefined, status: undefined })
                  } finally {
                    setDesactivando(false)
                  }
                }}
                disabled={desactivando}
                className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50"
              >
                {desactivando ? 'Desactivando...' : 'Desactivar'}
              </button>
            </div>
          ) : showBrick ? (
            // Formulario del Brick
            <AutopagoActivarForm
              subscriptionId={sub._id}
              montoMensual={sub.precioSnapshot ?? sub.monto}
              descuentoPct={descuentoPagoAutomaticoPct}
              onSuccess={() => {
                setAutopago({ activo: true, cardLast4: undefined, status: 'authorized' })
                setShowBrick(false)
              }}
              onCancel={() => setShowBrick(false)}
            />
          ) : (
            // Botón para abrir el formulario
            <button
              onClick={() => setShowBrick(true)}
              className="w-full text-xs text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg py-2 px-3 font-medium transition"
            >
              ⚡ Activar pago automático
              {descuentoPagoAutomaticoPct > 0 && (
                <span className="ml-1 text-purple-500">({descuentoPagoAutomaticoPct}% desc.)</span>
              )}
            </button>
          )}
        </div>
      )}

      {/* Info de vencimiento */}
      <div className="flex items-center justify-between mt-3">
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
