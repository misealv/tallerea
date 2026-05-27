// Componente servidor para mostrar lista de reseñas con texto
import Image from 'next/image'

interface ReviewItem {
  _id: string
  rating: number
  comentario: string
  createdAt: Date | string
  studentId?: {
    name?: string
    image?: string
  } | null
  workshopId?: {
    titulo?: string
    slug?: string
  } | null
}

interface ReviewsListProps {
  reviews: ReviewItem[]
  // Si true, muestra el nombre del taller al que pertenece la reseña (útil en perfil tallerista)
  mostrarTaller?: boolean
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={`text-sm ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}
        >
          ★
        </span>
      ))}
    </div>
  )
}

export default function ReviewsList({ reviews, mostrarTaller = false }: ReviewsListProps) {
  if (reviews.length === 0) return null

  return (
    <div className="space-y-4">
      {reviews.map((review) => {
        const alumno = review.studentId as { name?: string; image?: string } | null
        const taller = review.workshopId as { titulo?: string; slug?: string } | null
        const nombre = alumno?.name ?? 'Alumno anónimo'
        const inicial = nombre.charAt(0).toUpperCase()
        const fecha = new Date(review.createdAt).toLocaleDateString('es-CL', {
          month: 'long',
          year: 'numeric',
        })

        return (
          <div
            key={String(review._id)}
            className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm"
          >
            <div className="flex items-start gap-3">
              {/* Avatar del alumno */}
              <div className="shrink-0">
                {alumno?.image ? (
                  <Image
                    src={alumno.image}
                    alt={nombre}
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-semibold text-sm">
                    {inicial}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">{nombre}</p>
                  <span className="text-xs text-gray-400">{fecha}</span>
                </div>

                <StarRating rating={review.rating} />

                {/* Nombre del taller (solo en perfil tallerista) */}
                {mostrarTaller && taller?.titulo && (
                  <p className="text-xs text-purple-600 mt-1 font-medium">
                    Taller: {taller.titulo}
                  </p>
                )}

                {/* Texto de la reseña */}
                <p className="text-sm text-gray-700 mt-2 leading-relaxed">
                  {review.comentario}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
