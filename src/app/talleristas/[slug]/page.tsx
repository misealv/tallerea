import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { TallerService } from '@/services/TallerService'
import { WorkshopService } from '@/services/WorkshopService'
import { ReviewService } from '@/services/ReviewService'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import ReviewsList from '@/components/ReviewsList'

export const revalidate = 60

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const tallerista = await TallerService.getBySlug(params.slug)
  if (!tallerista) return { title: 'Tallerea' }
  return {
    title: `${tallerista.name} — Tallerea`,
    description: tallerista.taller?.bio?.slice(0, 155) ?? '',
  }
}

export default async function PerfilTalleristaPage({ params }: { params: { slug: string } }) {
  const tallerista = await TallerService.getBySlug(params.slug)
  if (!tallerista || !tallerista.taller) notFound()

  const { taller } = tallerista
  const { data: talleres } = await WorkshopService.getByOwnerId(String(tallerista._id))
  const talleresPub = talleres.filter(t => t.activo && !t.deletedAt)

  // Obtener reseñas de todos los talleres del tallerista
  const workshopIds = talleres.map(t => String(t._id))
  const reviews = workshopIds.length > 0
    ? await ReviewService.getByAccount(workshopIds, 10)
    : []

  const redes = taller.redesSociales ?? {}

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-10 space-y-10">

        {/* Header del perfil */}
        <div className="bg-white rounded-2xl border border-gray-200 p-8 flex gap-8 items-start">
          {taller.logo ? (
            <Image
              src={taller.logo}
              alt={tallerista.name}
              width={96}
              height={96}
              className="w-24 h-24 rounded-full object-cover shrink-0 border border-gray-200"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-purple-100 flex items-center justify-center shrink-0 text-3xl font-bold text-purple-600">
              {tallerista.name.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{tallerista.name}</h1>

            {taller.especialidades?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {taller.especialidades.map(e => (
                  <span key={e} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
                    {e}
                  </span>
                ))}
              </div>
            )}

            {taller.reviewsCount > 0 && (
              <p className="text-sm text-gray-500 mt-2">
                ⭐ {taller.reviewsAvg.toFixed(1)} · {taller.reviewsCount} reseña{taller.reviewsCount !== 1 ? 's' : ''}
              </p>
            )}

            {/* Redes sociales */}
            {(redes.instagram || redes.web || redes.facebook) && (
              <div className="flex gap-4 mt-3 text-sm">
                {redes.instagram && (
                  <a href={`https://instagram.com/${redes.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">
                    Instagram
                  </a>
                )}
                {redes.web && (
                  <a href={redes.web} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">
                    Sitio web
                  </a>
                )}
                {redes.facebook && (
                  <a href={redes.facebook} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">
                    Facebook
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bio */}
        {taller.bio && (
          <section className="bg-white rounded-2xl border border-gray-200 p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Sobre mí</h2>
            <p className="text-gray-700 whitespace-pre-line leading-relaxed">{taller.bio}</p>
          </section>
        )}

        {/* Formación y credenciales */}
        {(taller.formacion || taller.credenciales) && (
          <section className="bg-white rounded-2xl border border-gray-200 p-8 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Formación y experiencia</h2>
            {taller.formacion && <p className="text-gray-700 whitespace-pre-line leading-relaxed">{taller.formacion}</p>}
            {taller.credenciales && <p className="text-gray-700 whitespace-pre-line leading-relaxed">{taller.credenciales}</p>}
          </section>
        )}

        {/* Talleres */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Talleres activos ({talleresPub.length})</h2>
          {talleresPub.length === 0 ? (
            <p className="text-gray-500 text-sm">Este tallerista no tiene talleres publicados aún.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {talleresPub.map(w => (
                <Link
                  key={String(w._id)}
                  href={`/talleres/${w.slug}`}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-purple-300 hover:shadow-sm transition group"
                >
                  {w.imagenes?.[0] ? (
                    <div className="relative w-full h-40">
                      <Image
                        src={w.imagenes[0]}
                        alt={w.titulo}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, 50vw"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-40 bg-purple-50 flex items-center justify-center text-4xl">🎨</div>
                  )}
                  <div className="p-4">
                    <p className="font-semibold text-gray-900 group-hover:text-purple-700 transition">{w.titulo}</p>
                    <p className="text-xs text-gray-500 mt-1 capitalize">{w.tipo} · {w.modalidad}</p>
                    {w.descripcion && (
                      <p className="text-sm text-gray-600 mt-2 line-clamp-2">{w.descripcion}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Reseñas de alumnos */}
        {reviews.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Reseñas ({taller.reviewsCount})
            </h2>
            <ReviewsList
              reviews={reviews.map(r => ({
                _id: String(r._id),
                rating: r.rating,
                comentario: r.comentario,
                createdAt: r.createdAt,
                studentId: r.studentId as { name?: string; image?: string } | null,
                workshopId: r.workshopId as { titulo?: string; slug?: string } | null,
              }))}
              mostrarTaller
            />
          </section>
        )}

      </main>

      <Footer />
    </div>
  )
}
