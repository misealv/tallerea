'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Suspense } from 'react'

// ── Estados posibles ────────────────────────────────────────────────────────
type Stage =
  | 'validando'    // consumiendo el token con el provider magic-link
  | 'formulario'   // token válido → mostrar campo de contraseña
  | 'guardando'    // POST /api/auth/set-password en progreso
  | 'listo'        // contraseña guardada → redirigiendo
  | 'token_invalido'

function CompletarRegistroContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') ?? ''

  const [stage, setStage] = useState<Stage>('validando')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState('')

  // Consumir el magic link al montar (single-use)
  useEffect(() => {
    if (!token) { setStage('token_invalido'); return }

    signIn('magic-link', { token, redirect: false }).then(result => {
      if (result?.ok) {
        setStage('formulario')
      } else {
        setStage('token_invalido')
      }
    })
  }, [token])

  // Redirigir al panel tras guardar contraseña
  useEffect(() => {
    if (stage === 'listo') {
      const timer = setTimeout(() => router.push('/alumno'), 1500)
      return () => clearTimeout(timer)
    }
  }, [stage, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    if (password.length < 8) {
      setFormError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setFormError('Las contraseñas no coinciden.')
      return
    }

    setStage('guardando')
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(data?.error || 'Error al guardar contraseña.')
        setStage('formulario')
        return
      }
      setStage('listo')
    } catch {
      setFormError('Error de red. Intenta de nuevo.')
      setStage('formulario')
    }
  }

  // ── UI ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full space-y-6">

        {stage === 'validando' && (
          <div className="text-center space-y-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto" />
            <p className="text-gray-600">Verificando tu enlace…</p>
          </div>
        )}

        {stage === 'token_invalido' && (
          <div className="text-center space-y-4">
            <div className="text-4xl">⚠️</div>
            <h1 className="text-xl font-bold text-gray-900">Enlace inválido o expirado</h1>
            <p className="text-gray-600 text-sm">
              El enlace es de un solo uso y válido por 15 minutos. Puedes solicitar uno nuevo.
            </p>
            <a
              href="/alumno/acceso"
              className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors text-sm"
            >
              Solicitar nuevo enlace
            </a>
          </div>
        )}

        {(stage === 'formulario' || stage === 'guardando') && (
          <>
            <div className="text-center space-y-1">
              <div className="text-4xl">🔑</div>
              <h1 className="text-2xl font-bold text-gray-900">Crea tu contraseña</h1>
              <p className="text-gray-500 text-sm">
                Así podrás iniciar sesión la próxima vez directamente.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contraseña <span className="text-gray-400 font-normal">(mín. 8 caracteres)</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                  minLength={8}
                  disabled={stage === 'guardando'}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirmar contraseña
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                  disabled={stage === 'guardando'}
                />
              </div>

              {formError && (
                <p className="text-red-600 text-sm">{formError}</p>
              )}

              <button
                type="submit"
                disabled={stage === 'guardando'}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
              >
                {stage === 'guardando' ? 'Guardando…' : 'Guardar contraseña y entrar →'}
              </button>
            </form>
          </>
        )}

        {stage === 'listo' && (
          <div className="text-center space-y-3">
            <div className="text-4xl">✅</div>
            <h1 className="text-xl font-bold text-gray-900">¡Listo!</h1>
            <p className="text-gray-600 text-sm">Redirigiendo a tus talleres…</p>
          </div>
        )}

      </div>
    </div>
  )
}

export default function CompletarRegistroPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
      </div>
    }>
      <CompletarRegistroContent />
    </Suspense>
  )
}
