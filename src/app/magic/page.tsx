'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'

function MagicContent() {
  const router = useRouter()
  const params = useSearchParams()
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando')

  // Para solicitar un nuevo link inline
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState('')

  useEffect(() => {
    const token = params.get('token')
    if (!token) {
      setEstado('error')
      return
    }

    signIn('magic-link', { token, redirect: false }).then((res) => {
      if (res?.ok) {
        setEstado('ok')
        router.replace('/alumno')
      } else {
        setEstado('error')
      }
    })
  }, [params, router])

  async function handleReenvio(e: React.FormEvent) {
    e.preventDefault()
    setErrorEnvio('')
    setEnviando(true)

    const res = await fetch('/api/auth/magic/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    setEnviando(false)

    if (res.ok) {
      setEnviado(true)
    } else {
      const data = await res.json().catch(() => ({}))
      setErrorEnvio(data.error || 'Error al enviar. Intenta nuevamente.')
    }
  }

  if (estado === 'cargando') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Verificando enlace…</p>
        </div>
      </div>
    )
  }

  if (estado === 'ok') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Sesión iniciada. Redirigiendo…</p>
      </div>
    )
  }

  // estado === 'error'
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-6">
          <p className="text-4xl mb-3">⏱️</p>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Enlace vencido</h1>
          <p className="text-sm text-gray-500">
            El enlace de acceso es válido por <strong>15 minutos</strong> y de un solo uso.
            Ingresa tu email para recibir uno nuevo.
          </p>
        </div>

        {enviado ? (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-4 text-center text-sm">
            <p className="font-semibold mb-1">¡Revisa tu correo!</p>
            <p>Si el email corresponde a tu cuenta, recibirás un nuevo enlace en unos segundos.</p>
          </div>
        ) : (
          <form onSubmit={handleReenvio} className="space-y-3">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Tu email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.cl"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            {errorEnvio && (
              <p className="text-xs text-red-600">{errorEnvio}</p>
            )}
            <button
              type="submit"
              disabled={enviando}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-50 transition-colors"
            >
              {enviando ? 'Enviando…' : 'Enviar nuevo enlace'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-400 mt-5">
          ¿Aún no tienes cuenta?{' '}
          <Link href="/talleres" className="text-purple-600 hover:underline">
            Explora talleres
          </Link>
        </p>
      </div>
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
