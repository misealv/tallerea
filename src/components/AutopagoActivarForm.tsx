'use client'

/**
 * AutopagoActivarForm
 * Renderiza el CardPayment Brick de MercadoPago para tokenizar la tarjeta
 * del alumno y activar el mandato de cobro automático.
 *
 * La tarjeta NUNCA llega al backend: solo el card_token_id (un solo uso).
 * NEXT_PUBLIC_MP_PUBLIC_KEY se usa solo en el navegador.
 */

import { useEffect, useState } from 'react'
import { initMercadoPago, CardPayment } from '@mercadopago/sdk-react'

const MP_PUBLIC_KEY = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? ''

// Solo inicializar una vez por carga de página
let mpInitialized = false
function ensureInit() {
  if (!mpInitialized && MP_PUBLIC_KEY) {
    initMercadoPago(MP_PUBLIC_KEY, { locale: 'es-CL' })
    mpInitialized = true
  }
}

interface AutopagoActivarFormProps {
  subscriptionId: string
  montoMensual: number            // CLP entero — se muestra en el formulario
  descuentoPct?: number            // % de descuento por activar (informativo)
  /** Si se pasa, usa PATCH en lugar de POST (para cambio de tarjeta) */
  actionOverride?: 'cambiar-tarjeta'
  onSuccess: () => void            // callback al terminar con éxito
  onCancel: () => void             // callback para cerrar sin activar
}

type FormState = 'idle' | 'submitting' | 'success' | 'error'

export default function AutopagoActivarForm({
  subscriptionId,
  montoMensual,
  descuentoPct = 0,
  actionOverride,
  onSuccess,
  onCancel,
}: AutopagoActivarFormProps) {
  const [formState, setFormState] = useState<FormState>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    ensureInit()
  }, [])

  // Monto con descuento para mostrar en la UI
  const montoConDescuento = descuentoPct > 0
    ? Math.round(montoMensual * (1 - descuentoPct / 100))
    : montoMensual

  // Customización mínima del Brick — solo tokenización, sin cobrar
  const customization = {
    paymentMethods: {
      // Solo tarjetas: sin otros métodos
      minInstallments: 1,
      maxInstallments: 1,
    },
    visual: {
      style: {
        theme: 'default',
      },
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleBrickSubmit(formData: { token: string; [k: string]: any }) {
    setFormState('submitting')
    setErrorMsg('')

    // token de un solo uso generado por el Brick
    const cardTokenId: string = formData.token
    // Los 4 dígitos no están en el tipo oficial del Brick; usamos placeholder.
    // El webhook de MP puede actualizar este campo con el valor real en Fase 4.
    const last4 = '****'

    if (!cardTokenId) {
      setErrorMsg('No se pudo tokenizar la tarjeta. Intenta de nuevo.')
      setFormState('error')
      return
    }

    try {
      const method = actionOverride === 'cambiar-tarjeta' ? 'PATCH' : 'POST'
      const body = actionOverride === 'cambiar-tarjeta'
        ? JSON.stringify({ action: 'cambiar-tarjeta', cardTokenId, cardLast4: last4 })
        : JSON.stringify({ cardTokenId, cardLast4: last4 })

      const res = await fetch(`/api/subscriptions/${subscriptionId}/autopago`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body,
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error ?? 'Error al activar el pago automático')
        setFormState('error')
        return
      }

      setFormState('success')
      onSuccess()
    } catch {
      setErrorMsg('Error de conexión. Intenta de nuevo.')
      setFormState('error')
    }
  }

  function handleError(error: unknown) {
    console.warn('[AutopagoActivarForm] Brick error:', error)
    setErrorMsg('Ocurrió un error con el formulario de tarjeta. Intenta de nuevo.')
    setFormState('error')
  }

  if (!MP_PUBLIC_KEY) {
    return (
      <p className="text-sm text-red-500">
        Pago automático no disponible (clave pública no configurada).
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Encabezado informativo */}
      <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
        <p className="text-sm font-medium text-purple-800">Activar pago automático</p>
        <p className="text-xs text-purple-600 mt-1">
          Tu tarjeta se cobrará automáticamente cada mes.
          {descuentoPct > 0 && (
            <> Precio con descuento: <strong>${montoConDescuento.toLocaleString('es-CL')}/mes</strong> (ahorro {descuentoPct}%).</>
          )}
          {descuentoPct === 0 && (
            <> Monto mensual: <strong>${montoMensual.toLocaleString('es-CL')}</strong>.</>
          )}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Podés cancelar en cualquier momento desde tu perfil.
        </p>
      </div>

      {/* CardPayment Brick — tokenización sin cobro inmediato */}
      {formState !== 'success' && (
        <CardPayment
          initialization={{ amount: montoConDescuento }}
          customization={customization}
          onSubmit={handleBrickSubmit}
          onError={handleError}
          onReady={() => {/* Brick listo */}}
        />
      )}

      {/* Feedback de estado */}
      {formState === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{errorMsg}</p>
          <button
            onClick={() => { setFormState('idle'); setErrorMsg('') }}
            className="text-xs text-red-600 underline mt-1"
          >
            Reintentar
          </button>
        </div>
      )}

      {formState === 'success' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-sm text-green-700 font-medium">
            ✓ Pago automático activado correctamente
          </p>
        </div>
      )}

      {formState === 'submitting' && (
        <p className="text-sm text-gray-500 text-center">Activando...</p>
      )}

      {/* Acciones */}
      {formState !== 'success' && (
        <div className="flex justify-end">
          <button
            onClick={onCancel}
            disabled={formState === 'submitting'}
            className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
