'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

function PagoExitosoContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const estado = searchParams.get('estado') // 'error' | 'pendiente' | null (= exitoso)
  const [segundos, setSegundos] = useState(5)

  // Alumno autenticado con pago exitoso: redirigir automáticamente
  useEffect(() => {
    if (status === 'loading') return
    if (estado) return  // Error o pendiente: no redirigir
    if (session?.user?.id) {
      const timer = setInterval(() => {
        setSegundos(s => {
          if (s <= 1) {
            clearInterval(timer)
            router.push('/alumno?pago=ok')
            return 0
          }
          return s - 1
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [session, status, router, estado])

  if (status === 'loading') return null

  // Pago con error
  if (estado === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full text-center space-y-5">
          <div className="text-5xl">😕</div>
          <h1 className="text-2xl font-bold text-gray-900">El pago no se completó</h1>
          <p className="text-gray-600">Puedes intentarlo nuevamente desde el taller.</p>
          <a href="/talleres" className="inline-block bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors">
            Ver talleres
          </a>
        </div>
      </div>
    )
  }

  // Pago pendiente
  if (estado === 'pendiente') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full text-center space-y-5">
          <div className="text-5xl">⏳</div>
          <h1 className="text-2xl font-bold text-gray-900">Pago en proceso</h1>
          <p className="text-gray-600">
            Tu pago está siendo procesado. Te notificaremos por correo cuando se confirme.
          </p>
        </div>
      </div>
    )
  }

  // Invitado sin sesión — pago exitoso
  if (!session?.user?.id) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full text-center space-y-5">
          <div className="text-5xl">🎉</div>
          <h1 className="text-2xl font-bold text-gray-900">¡Pago confirmado!</h1>
          <p className="text-gray-600">
            Te enviamos un correo con un <strong>enlace mágico</strong> para acceder a tus talleres.
            Revisa tu bandeja de entrada (y la carpeta spam).
          </p>
          <p className="text-sm text-gray-400">
            El enlace es válido por <strong>15 minutos</strong> y es de un solo uso.
          </p>
          <a
            href="/talleres"
            className="inline-block mt-4 text-purple-600 hover:underline text-sm"
          >
            Volver al catálogo de talleres
          </a>
        </div>
      </div>
    )
  }

  // Usuario autenticado — mostramos countdown
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full text-center space-y-5">
        <div className="text-5xl">🎉</div>
        <h1 className="text-2xl font-bold text-gray-900">¡Inscripción confirmada!</h1>
        <p className="text-gray-600">
          Te redirigimos a tus talleres en <strong>{segundos}</strong> segundo{segundos !== 1 ? 's' : ''}…
        </p>
        <button
          onClick={() => router.push('/alumno?pago=ok')}
          className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors"
        >
          Ir ahora
        </button>
      </div>
    </div>
  )
}

export default function PagoExitosoPage() {
  return (
    <Suspense fallback={null}>
      <PagoExitosoContent />
    </Suspense>
  )
}
