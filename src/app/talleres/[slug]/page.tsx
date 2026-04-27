import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { WorkshopService } from '@/services/WorkshopService'
import { SiteConfigService } from '@/services/SiteConfigService'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import PrecioCard from '@/components/PrecioCard'
import PublicWeeklyCalendar from '@/components/PublicWeeklyCalendar'
import WorkshopGallery from '@/components/WorkshopGallery'
import ClasePruebaCTA from '@/components/ClasePruebaCTA'

export const revalidate = 3600 // 1 hora — Googlebot obtiene página cacheada en edge

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const workshop = await WorkshopService.getBySlug(slug)
  if (!workshop) return { title: 'Tallerea' }
  const loc = workshop.locationId as unknown as { comuna?: string; ciudad?: string } | null
  const owner = workshop.ownerId as unknown as { name?: string } | null

  const titulo = workshop.titulo
  const locLabel = loc?.comuna ? ` en ${loc.comuna}` : ''
  const pageTitle = `${titulo}${locLabel} — Tallerea`
  const descripcion = workshop.descripcion?.slice(0, 300) ?? ''
  const resumen = workshop.descripcion?.slice(0, 155) ?? ''

  // Imagen OG: primera foto del taller, o imagen de perfil del dueño, o fallback
  const ogImage = workshop.imagenes?.[0] ?? null

  const ogImages = ogImage
    ? [{ url: ogImage, width: 1200, height: 630, alt: titulo }]
    : []

  return {
    title: pageTitle,
    description: resumen,
    openGraph: {
      title: titulo,
      description: descripcion,
      url: `https://tallerea.cl/talleres/${slug}`,
      siteName: 'Tallerea',
      locale: 'es_CL',
      type: 'website',
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image',
      title: titulo,
      description: resumen,
      images: ogImage ? [ogImage] : [],
    },
    alternates: {
      canonical: `https://tallerea.cl/talleres/${slug}`,
    },
    other: {
      // WhatsApp y iMessage leen estas etiquetas directamente
      'og:image:type': 'image/jpeg',
    },
    // Datos para el tallerista (útil para SEO)
    ...(owner?.name && {
      authors: [{ name: owner.name }],
    }),
  }
}

const tipoIcon: Record<string, string> = {
  visual: '🎨', teatro: '🎭', danza: '💃', musica: '🎵', otro: '✨',
}

const diaLabel: Record<string, string> = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
  viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
}

export default async function WorkshopDetailPage({ params }: PageProps) {
  const { slug } = await params
  const workshop = await WorkshopService.getBySlug(slug)
  if (!workshop) notFound()

  const comisionPct = await SiteConfigService.getComisionPct()

  const loc = workshop.locationId as unknown as {
    nombre: string; direccion: string; comuna: string; ciudad: string
    coordenadas?: { lat: number; lng: number }
  } | null
  const owner = workshop.ownerId as unknown as {
    name: string
    image?: string
    taller?: {
      slug?: string
      bio?: string
      logo?: string
      especialidades?: string[]
      reviewsCount?: number
      reviewsAvg?: number
      redesSociales?: { instagram?: string; web?: string; facebook?: string }
    }
  } | null

  return (
    <>
      {/* JSON-LD Schema.org — Course + Offer para rich snippets en Google */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Course',
            name: workshop.titulo,
            description: workshop.descripcion,
            url: `https://tallerea.cl/talleres/${workshop.slug}`,
            image: workshop.imagenes?.[0] ?? undefined,
            ...(workshop.reviewsCount > 0 && {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: workshop.reviewsAvg.toFixed(1),
                reviewCount: workshop.reviewsCount,
                bestRating: 5,
                worstRating: 1,
              },
            }),
            provider: {
              '@type': 'Person',
              name: owner?.name ?? 'Tallerea',
              ...(owner?.taller?.slug && {
                url: `https://tallerea.cl/talleristas/${owner.taller.slug}`,
              }),
            },
            offers: {
              '@type': 'Offer',
              priceCurrency: 'CLP',
              price: (() => {
                const esNeto = workshop.precioModalidad === 'neto'
                const bruto = esNeto ? Math.round((workshop.precio ?? 0) * 100 / (100 - comisionPct)) : (workshop.precio ?? 0)
                return bruto
              })(),
              availability: (workshop.cupoPorSesion ?? 0) > 0
                ? 'https://schema.org/InStock'
                : 'https://schema.org/SoldOut',
              url: `https://tallerea.cl/talleres/${workshop.slug}`,
            },
            ...(loc && {
              location: {
                '@type': 'Place',
                name: loc.nombre,
                address: {
                  '@type': 'PostalAddress',
                  addressLocality: loc.comuna,
                  addressRegion: loc.ciudad,
                  addressCountry: 'CL',
                },
              },
            }),
            inLanguage: 'es',
          }),
        }}
      />
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-4 flex gap-1">
          <Link href="/talleres" className="hover:text-purple-600">Talleres</Link>
          <span>/</span>
          <span className="text-gray-800">{workshop.titulo}</span>
        </nav>

        {/* Galería de imágenes */}
        <WorkshopGallery
          imagenes={workshop.imagenes ?? []}
          titulo={workshop.titulo}
          fallbackEmoji={tipoIcon[workshop.tipo] || '✨'}
        />

        {/* Tarjeta de fecha — talleres puntuales con fecha concreta */}
        {(() => {
          if (workshop.modeloAcceso === 'recurrente') return null
          const slotsConFecha = (workshop.slots || []).filter((s: { fecha?: Date }) => !!s.fecha)
          if (slotsConFecha.length === 0 && !workshop.fechaInicio) return null

          // Usar primer slot con fecha o fechaInicio como fallback
          const primeraFecha = slotsConFecha[0]?.fecha
            ? new Date(slotsConFecha[0].fecha as Date)
            : workshop.fechaInicio
            ? new Date(workshop.fechaInicio)
            : null
          if (!primeraFecha) return null

          const primerSlot = slotsConFecha[0] as { horaInicio?: string; horaFin?: string; fecha?: Date } | undefined

          const fechaLabel = primeraFecha.toLocaleDateString('es-CL', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            timeZone: 'UTC',
          })

          const horaLabel = primerSlot?.horaInicio && primerSlot?.horaFin
            ? `${primerSlot.horaInicio} – ${primerSlot.horaFin} hrs`
            : null

          const esMultiple = slotsConFecha.length > 1

          return (
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                {/* Bloque de calendario visual */}
                <div className="flex-shrink-0 bg-white rounded-lg overflow-hidden w-14 text-center shadow-sm">
                  <div className="bg-indigo-600 text-white text-[10px] font-bold uppercase py-0.5 tracking-wide">
                    {primeraFecha.toLocaleDateString('es-CL', { month: 'short', timeZone: 'UTC' })}
                  </div>
                  <div className="text-indigo-700 font-extrabold text-2xl leading-tight py-1">
                    {primeraFecha.toLocaleDateString('es-CL', { day: 'numeric', timeZone: 'UTC' })}
                  </div>
                </div>
                <div>
                  <p className="text-white font-bold text-base leading-tight capitalize">{fechaLabel}</p>
                  {horaLabel && (
                    <p className="text-indigo-100 text-sm mt-0.5">🕐 {horaLabel}</p>
                  )}
                  {esMultiple && (
                    <p className="text-indigo-200 text-xs mt-0.5">{slotsConFecha.length} sesiones en total</p>
                  )}
                </div>
              </div>
              {loc && (
                <div className="text-right hidden sm:block">
                  <p className="text-indigo-100 text-xs">📍 {loc.nombre}</p>
                  <p className="text-indigo-200 text-xs">{loc.comuna}</p>
                </div>
              )}
            </div>
          )
        })()}

        {/* CTA Hero — clase de prueba */}
        {workshop.clasePrueba?.habilitada && (
          <ClasePruebaCTA
            workshopSlug={workshop.slug}
            precio={workshop.clasePrueba.precio}
            variant="hero"
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-8">
          {/* Columna principal */}
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <span>{tipoIcon[workshop.tipo]} {workshop.tipo}</span>
                <span>·</span>
                <span className="capitalize">{workshop.modalidad}</span>
                {loc && <><span>·</span><span>{loc.comuna}</span></>}
              </div>
              <h1 className="text-3xl font-bold text-gray-900">{workshop.titulo}</h1>

              {/* Calificación del taller */}
              {(workshop.reviewsCount ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 mt-2">
                  {[1,2,3,4,5].map((star) => (
                    <span key={star} className={`text-lg ${star <= Math.round(workshop.reviewsAvg) ? 'text-yellow-400' : 'text-gray-300'}`}>★</span>
                  ))}
                  <span className="text-sm font-semibold text-gray-800 ml-1">{workshop.reviewsAvg.toFixed(1)}</span>
                  <span className="text-sm text-gray-500">({workshop.reviewsCount} {workshop.reviewsCount === 1 ? 'reseña' : 'reseñas'})</span>
                </div>
              )}
            </div>

            <div className="prose prose-gray max-w-none">
              <p className="whitespace-pre-line text-gray-700">{workshop.descripcion}</p>
            </div>

            {/* Horarios (slots) */}
            {(() => {
              const slotsConFecha = (workshop.slots || [])
                .filter((s: { fecha?: Date }) => !!s.fecha)
                .map((s: { fecha?: Date; dia?: string; horaInicio: string; horaFin: string; reservas?: number; cancelado?: boolean }) => ({
                  fecha: s.fecha ? new Date(s.fecha).toISOString() : undefined,
                  dia: s.dia,
                  horaInicio: s.horaInicio,
                  horaFin: s.horaFin,
                  reservas: s.reservas ?? 0,
                  cancelado: !!s.cancelado,
                }))

              // Plantilla semanal (patrón) — si no hay slots con fecha
              const plantilla = workshop.plantillaSemanal || []
              const slotsSinFecha = (workshop.slots || []).filter(
                (s: { fecha?: Date; dia?: string }) => !s.fecha && s.dia
              )

              if (slotsConFecha.length === 0 && plantilla.length === 0 && slotsSinFecha.length === 0) {
                return null
              }

              return (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">
                    {slotsConFecha.length > 0 ? 'Calendario de sesiones' : 'Horarios'}
                  </h2>

                  {slotsConFecha.length > 0 && (
                    <PublicWeeklyCalendar
                      slots={slotsConFecha}
                      cupoPorSesion={workshop.cupoPorSesion || 0}
                    />
                  )}

                  {slotsConFecha.length === 0 && (plantilla.length > 0 || slotsSinFecha.length > 0) && (
                    <div className="space-y-2">
                      {(plantilla.length > 0 ? plantilla : slotsSinFecha).map(
                        (s: { dia?: string; horaInicio: string; horaFin: string }, i: number) => (
                          <div key={i} className="flex items-center gap-3 rounded-lg px-4 py-2 bg-gray-50">
                            <span className="font-medium text-gray-700 w-24">{diaLabel[s.dia ?? ''] || s.dia}</span>
                            <span className="text-gray-600">{s.horaInicio} — {s.horaFin}</span>
                          </div>
                        )
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        Horarios recurrentes. Las sesiones concretas se publicarán próximamente.
                      </p>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Edades */}
            {(workshop.edadMinima || workshop.edadMaxima) && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Edades</h2>
                <p className="text-gray-600">
                  {workshop.edadMinima && workshop.edadMaxima
                    ? `${workshop.edadMinima} a ${workshop.edadMaxima} años`
                    : workshop.edadMinima
                    ? `Desde ${workshop.edadMinima} años`
                    : `Hasta ${workshop.edadMaxima} años`}
                </p>
              </div>
            )}

            {/* Ubicación */}
            {loc && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Ubicación</h2>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="font-medium text-gray-800">{loc.nombre}</p>
                  <p className="text-sm text-gray-600">{loc.direccion}, {loc.comuna}, {loc.ciudad}</p>
                </div>
                {/* Mapa Google Maps embed */}
                <div className="mt-3 rounded-xl overflow-hidden border border-gray-200 h-56">
                  <iframe
                    title={`Mapa: ${loc.nombre}`}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(
                      loc.coordenadas
                        ? `${loc.coordenadas.lat},${loc.coordenadas.lng}`
                        : `${loc.direccion}, ${loc.comuna}, ${loc.ciudad}`
                    )}&output=embed&z=16`}
                  />
                </div>
              </div>
            )}

            {/* Sobre el profesor */}
            {owner && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Sobre el profesor</h2>
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-5">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="relative w-16 h-16 flex-shrink-0">
                      {owner.taller?.logo || owner.image ? (
                        <Image
                          src={(owner.taller?.logo || owner.image)!}
                          alt={owner.name}
                          fill
                          className="object-cover rounded-full"
                          sizes="64px"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-purple-200 rounded-full flex items-center justify-center text-purple-700 text-2xl font-bold">
                          {owner.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-bold text-gray-900">{owner.name}</p>

                      {/* Rating */}
                      {(owner.taller?.reviewsCount ?? 0) > 0 && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-yellow-400 text-sm">★</span>
                          <span className="text-sm font-medium text-gray-700">
                            {owner.taller!.reviewsAvg!.toFixed(1)}
                          </span>
                          <span className="text-sm text-gray-500">
                            ({owner.taller!.reviewsCount} reseñas)
                          </span>
                        </div>
                      )}

                      {/* Especialidades */}
                      {(owner.taller?.especialidades?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {owner.taller!.especialidades!.slice(0, 4).map((esp) => (
                            <span key={esp} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                              {esp}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bio resumida */}
                  {owner.taller?.bio && (
                    <p className="text-sm text-gray-600 mt-4 leading-relaxed line-clamp-3">
                      {owner.taller.bio}
                    </p>
                  )}

                  {/* Redes sociales */}
                  {(owner.taller?.redesSociales?.instagram || owner.taller?.redesSociales?.web) && (
                    <div className="flex gap-3 mt-3">
                      {owner.taller?.redesSociales?.instagram && (
                        <a
                          href={`https://instagram.com/${owner.taller.redesSociales.instagram.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-purple-600 hover:underline"
                        >
                          Instagram
                        </a>
                      )}
                      {owner.taller?.redesSociales?.web && (
                        <a
                          href={owner.taller.redesSociales.web}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-purple-600 hover:underline"
                        >
                          Sitio web
                        </a>
                      )}
                    </div>
                  )}

                  {/* Link al perfil completo */}
                  {owner.taller?.slug && (
                    <div className="mt-4">
                      <Link
                        href={`/talleristas/${owner.taller.slug}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-purple-700 hover:text-purple-900"
                      >
                        Ver perfil completo →
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar derecha */}
          <div className="space-y-4">
            <PrecioCard
              workshopId={String(workshop._id)}
              workshopSlug={workshop.slug}
              modeloAcceso={workshop.modeloAcceso ?? 'puntual'}
              modalidadPrecio={workshop.modalidadPrecio ?? (workshop.precio === 0 ? 'gratuito' : 'fijo')}
              precioFijo={(() => {
                // [FINANCE RISK] Si precioModalidad es 'neto', convertir a precio bruto (lo que paga el alumno)
                const base = workshop.precioFijo?.monto ?? workshop.precio ?? 0
                if (workshop.precioModalidad === 'neto' && base > 0) {
                  return Math.round(base * 100 / (100 - comisionPct))
                }
                return base
              })()}
              aporteVoluntario={workshop.aporteVoluntario ? {
                sugerido: workshop.aporteVoluntario.sugerido,
                minimo:   workshop.aporteVoluntario.minimo,
                maximo:   workshop.aporteVoluntario.maximo ?? null,
              } : undefined}
              paquetes={(workshop.paquetes ?? []).map((p: { _id: { toString(): string }; nombre: string; precio: number; sesionesIncluidas: number; duracionDias: number; activo: boolean }) => {
                // [FINANCE RISK] Convertir precio neto a bruto para mostrar al alumno
                const precioPublicoPaquete = workshop.precioModalidad === 'neto' && p.precio > 0
                  ? Math.round(p.precio * 100 / (100 - comisionPct))
                  : p.precio
                return {
                  _id:               p._id.toString(),
                  nombre:            p.nombre,
                  precio:            precioPublicoPaquete,
                  sesionesIncluidas: p.sesionesIncluidas,
                  duracionDias:      p.duracionDias,
                  activo:            p.activo,
                }
              })}
              clasePrueba={workshop.clasePrueba ? {
                habilitada: workshop.clasePrueba.habilitada,
                precio:     workshop.clasePrueba.precio,
              } : undefined}
              cupoPorSesion={workshop.cupoPorSesion}
              plan={workshop.plan ?? null}
            />
          </div>
        </div>
        {/* CTA Footer — clase de prueba */}
        {workshop.clasePrueba?.habilitada && (
          <ClasePruebaCTA
            workshopSlug={workshop.slug}
            precio={workshop.clasePrueba.precio}
            variant="footer"
          />
        )}
      </main>
      <Footer />
    </>
  )
}
