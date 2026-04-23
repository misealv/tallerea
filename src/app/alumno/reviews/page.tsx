import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { ReviewService } from '@/services/ReviewService'
import ReviewForm from '@/components/ReviewForm'

export const dynamic = 'force-dynamic'

export default async function ReviewsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/alumno/acceso')

  const elegibles = await ReviewService.getElegibles(session.user.id)

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mis reseñas pendientes</h1>
        <p className="mt-1 text-sm text-gray-500">
          Talleres que puedes calificar según tu historial de asistencia
        </p>
      </div>

      {elegibles.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
          No tienes talleres pendientes de reseñar en este momento.
        </div>
      ) : (
        <ul className="space-y-6">
          {elegibles.map(w => (
            <li
              key={String(w._id)}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4"
            >
              <div className="flex items-center gap-3">
                {w.imagenes?.[0] ? (
                  <Image
                    src={w.imagenes[0]}
                    alt={w.titulo}
                    width={56}
                    height={56}
                    className="h-14 w-14 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-indigo-100 flex-shrink-0" />
                )}
                <div>
                  <h2 className="font-semibold text-gray-900 leading-snug">{w.titulo}</h2>
                  <a
                    href={`/talleres/${w.slug}`}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Ver taller
                  </a>
                </div>
              </div>

              <ReviewForm workshopId={String(w._id)} workshopTitulo={w.titulo} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
