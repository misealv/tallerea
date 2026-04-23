'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function MagicContent() {
  const router = useRouter()
  const params = useSearchParams()
  const [error, setError] = useState('')

  useEffect(() => {
    const token = params.get('token')
    if (!token) {
      setError('Enlace inválido o expirado.')
      return
    }

    signIn('magic-link', { token, redirect: false }).then((res) => {
      if (res?.error) {
        setError('El enlace expiró o ya fue utilizado. Solicita uno nuevo.')
      } else {
        router.push('/alumno')
      }
    })
  }, [params, router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <a href="/alumno/acceso" className="text-purple-600 underline text-sm">
            Solicitar nuevo enlace
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500">Verificando enlace…</p>
    </div>
  )
}

export default function MagicPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Cargando…</p>
      </div>
    }>
      <MagicContent />
    </Suspense>
  )
}
