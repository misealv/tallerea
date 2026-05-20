'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function RecuperarPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const res = await fetch('/api/auth/magic/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Error al enviar')
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Recuperar acceso</h1>
        <p className="text-sm text-gray-500 mb-6">
          Te enviaremos un enlace mágico para entrar sin contraseña. Una vez dentro,
          puedes cambiarla en <strong>Mi cuenta → Cambiar contraseña</strong>.
        </p>

        {sent ? (
          <div className="bg-green-50 text-green-700 text-sm rounded-lg p-4 space-y-2">
            <p className="font-medium">✓ Si el email está registrado, ya enviamos el enlace.</p>
            <p>Revisa tu bandeja de entrada (y la carpeta de spam). El enlace expira en 15 minutos.</p>
            <Link href="/login" className="inline-block mt-2 text-purple-600 hover:underline">
              Volver al login
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="tu@email.cl"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-purple-600 text-white py-2.5 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {loading ? 'Enviando…' : 'Enviar enlace'}
              </button>
            </form>
            <p className="text-center text-sm text-gray-500 mt-6">
              <Link href="/login" className="text-purple-600 hover:underline">
                Volver al login
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
