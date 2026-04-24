import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { EnrollmentService } from '@/services/EnrollmentService'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import Link from 'next/link'
import CancelButton from './CancelButton'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Mis talleres — Tallerea',
}

const estadoBadge: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  pagado: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-600',
}

export default async function MisTalleresPage({
  searchParams,
}: {
  searchParams: Promise<{ pago?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/mis-talleres')

  const params = await searchParams
  const result = await EnrollmentService.getByStudentId(session.user.id, 1, 50)

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Mis talleres</h1>

        {params.pago === 'ok' && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
            ¡Inscripción confirmada! Ya estás inscrito.
          </div>
        )}
        {params.pago === 'error' && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
            Hubo un problema con el pago. Intenta nuevamente.
          </div>
        )}

        {result.data.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl">
            <p className="text-5xl mb-4">📚</p>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Aún no tienes inscripciones</h2>
            <p className="text-gray-500 mb-4">Busca talleres que te interesen y regístrate.</p>
            <Link href="/talleres" className="text-purple-600 font-medium hover:underline">
              Explorar talleres →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {result.data.map((e) => {
              const w = e.workshopId as unknown as { _id: string; titulo: string; slug: string; tipo: string } | null
              const esPrueba = (e as unknown as { esClasePrueba?: boolean }).esClasePrueba === true
              return (
                <div key={String(e._id)} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/talleres/${w?.slug || ''}`}
                        className="font-semibold text-gray-900 hover:text-purple-700"
                      >
                        {w?.titulo || 'Taller'}
                      </Link>
                      {esPrueba && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                          Clase de prueba
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-xs px-2 py-1 rounded-full ${estadoBadge[e.estado]}`}>
                        {e.estado}
                      </span>
                      <span className="text-sm text-gray-500">
                        ${e.monto.toLocaleString('es-CL')}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(e.createdAt).toLocaleDateString('es-CL')}
                      </span>
                    </div>
                    {/* CTA conversión si es clase de prueba pagada */}
                    {esPrueba && e.estado === 'pagado' && w?.slug && (
                      <Link
                        href={`/talleres/${w.slug}`}
                        className="inline-block mt-2 text-xs text-purple-600 hover:text-purple-800 font-medium underline"
                      >
                        Suscribirme al taller completo →
                      </Link>
                    )}
                  </div>
                  {e.estado === 'pendiente' && (
                    <CancelButton enrollmentId={String(e._id)} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
      <Footer />
    </>
  )
}
