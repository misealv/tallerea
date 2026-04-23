'use client'

import { useState } from 'react'

export default function AlumnoAccesoPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/magic/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Error al enviar el enlace')
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">¡Revisa tu correo!</h1>
          <p className="text-gray-600">
            Si <strong>{email}</strong> corresponde a una cuenta de alumno, te enviamos un enlace de acceso. Es válido por 15 minutos.
          </p>
          <p className="text-gray-500 text-sm mt-4">
            ¿Aún no compras tu primer taller?{' '}
            <a href="/talleres" className="text-purple-600 underline">Explora talleres</a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
          Accede a tus talleres
        </h1>
        <p className="text-center text-gray-500 text-sm mb-6">
          Te enviamos un enlace de acceso a tu correo. No necesitas contraseña.
        </p>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>
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

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? 'Enviando…' : 'Enviar enlace de acceso'}
          </button>
        </form>
      </div>
    </div>
  )
}
