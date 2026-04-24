'use client'

import { useEffect } from 'react'
import { signOut } from 'next-auth/react'
import Link from 'next/link'

export default function PendienteClient({ recienEnviado }: { recienEnviado: boolean }) {
  useEffect(() => {
    if (recienEnviado) {
      // Cerrar sesión automáticamente tras envío de solicitud
      const timer = setTimeout(() => {
        signOut({ callbackUrl: '/' })
      }, 4000) // 4 segundos para que el usuario lea el mensaje
      return () => clearTimeout(timer)
    }
  }, [recienEnviado])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="text-5xl mb-4">{recienEnviado ? '🎉' : '⏳'}</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {recienEnviado ? '¡Solicitud enviada!' : 'Solicitud en revisión'}
        </h1>
        <p className="text-gray-600 text-sm leading-relaxed mb-4">
          {recienEnviado
            ? 'Recibimos tu solicitud. Nuestro equipo la revisará en los próximos días hábiles y te notificaremos por email cuando esté aprobada.'
            : 'Tu solicitud está siendo revisada. Te notificaremos por email cuando esté aprobada.'}
        </p>
        {recienEnviado && (
          <p className="text-sm text-purple-600 font-medium mb-4">
            También te enviamos un correo de confirmación.
          </p>
        )}
        <p className="text-xs text-gray-400 mb-6">
          Si tienes alguna duda, escríbenos a{' '}
          <a href="mailto:hola@tallerea.cl" className="text-purple-600 underline">
            hola@tallerea.cl
          </a>
        </p>
        <Link
          href="/"
          className="inline-block text-sm text-purple-600 hover:text-purple-700 font-medium"
        >
          ← Volver al inicio
        </Link>
      </div>
    </div>
  )
}
