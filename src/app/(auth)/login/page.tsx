'use client'

import { useState, Suspense } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function RegisteredBanner() {
  const searchParams = useSearchParams()
  if (searchParams.get('registered') !== '1') return null
  return (
    <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">
      ¡Cuenta creada! Inicia sesión para continuar con tu solicitud.
    </div>
  )
}

function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (res?.error) {
      setError('Email o contraseña incorrectos')
      return
    }

    // Redirigir según estado del taller
    const session = await getSession()
    const tallerEstado = session?.user?.tallerEstado

    if (session?.user?.role === 'admin') {
      router.push('/admin')
    } else if (tallerEstado === 'aprobado') {
      router.push('/tallerista')
    } else if (tallerEstado === 'pendiente') {
      router.push('/tallerista/pendiente')
    } else if (tallerEstado === 'rechazado') {
      router.push('/tallerista/onboarding')
    } else {
      // Alumno sin taller
      router.push('/alumno')
    }
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">
          Iniciar sesión
        </h1>

        {error && (          <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="tu@email.cl"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 text-white py-2.5 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-sm mt-4">
          <Link href="/recuperar" className="text-purple-600 hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>

        <p className="text-center text-sm text-gray-500 mt-6">
          ¿Quieres publicar talleres?{' '}
          <Link href="/registro-tallerista" className="text-purple-600 font-medium hover:underline">
            Regístrate como tallerista
          </Link>
        </p>
        <p className="text-center text-sm text-gray-500 mt-2">
          ¿Eres alumno?{' '}
          <Link href="/alumno/acceso" className="text-purple-600 font-medium hover:underline">
            Acceder con enlace al correo
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <RegisteredBanner />
      <LoginForm />
    </Suspense>
  )
}
