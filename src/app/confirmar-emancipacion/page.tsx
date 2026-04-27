'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'

// Token de emancipación llega en ?token=... desde el email del apoderado.
// Se decodifica en el cliente solo para mostrar la info embebida en el payload.
// La verificación real (HMAC + expiración) ocurre en el servidor al confirmar.
function decodeTokenPreview(token: string): {
  dependentNombre: string
  newEmail: string
} | null {
  try {
    const { payload } = JSON.parse(Buffer.from(token, 'base64url').toString())
    const data = JSON.parse(payload)
    return { dependentNombre: data.dependentNombre, newEmail: data.newEmail }
  } catch {
    return null
  }
}

export default function ConfirmarEmancipacionPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const preview = token ? decodeTokenPreview(token) : null

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleConfirm() {
    setStatus('loading')
    try {
      const res = await fetch('/api/emancipate/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus('success')
        setMessage(data.message)
      } else {
        setStatus('error')
        setMessage(data.error || 'Error al confirmar')
      }
    } catch {
      setStatus('error')
      setMessage('Error de red — intenta nuevamente')
    }
  }

  if (!token || !preview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md w-full text-center">
          <p className="text-red-600 font-medium">Enlace inválido o expirado.</p>
          <p className="text-sm text-gray-500 mt-2">Solicita un nuevo enlace desde tu panel de dependientes.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md w-full">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-purple-100 mb-4">
            <svg className="w-7 h-7 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Crear cuenta para {preview.dependentNombre}</h1>
        </div>

        {status === 'success' ? (
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-2">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-gray-800 font-medium">{message}</p>
            <p className="text-sm text-gray-500">Revisa la bandeja de entrada de <strong>{preview.newEmail}</strong>.</p>
          </div>
        ) : status === 'error' ? (
          <div className="text-center space-y-4">
            <p className="text-red-600 font-medium">{message}</p>
            <button
              onClick={() => setStatus('idle')}
              className="text-sm text-purple-600 hover:underline"
            >
              Volver a intentar
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-gray-600">Al confirmar:</p>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-purple-500 shrink-0">✓</span>
                Se creará una cuenta independiente para <strong>{preview.dependentNombre}</strong>
              </li>
              <li className="flex gap-2">
                <span className="text-purple-500 shrink-0">✓</span>
                Su historial de clases quedará en la nueva cuenta
              </li>
              <li className="flex gap-2">
                <span className="text-purple-500 shrink-0">✓</span>
                Recibirá acceso en <strong>{preview.newEmail}</strong>
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">→</span>
                {preview.dependentNombre} dejará de aparecer como dependiente
              </li>
            </ul>

            <button
              onClick={handleConfirm}
              disabled={status === 'loading'}
              className="w-full bg-purple-600 text-white py-3 rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {status === 'loading' ? 'Procesando...' : 'Confirmar emancipación'}
            </button>
            <p className="text-xs text-gray-400 text-center">Esta acción no se puede deshacer.</p>
          </div>
        )}
      </div>
    </div>
  )
}
