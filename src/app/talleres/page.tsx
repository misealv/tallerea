import { Suspense } from 'react'
import { WorkshopService } from '@/services/WorkshopService'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import WorkshopCard from '@/components/WorkshopCard'
import SearchFilters from '@/components/SearchFilters'

export const metadata = {
  title: 'Buscar talleres de arte — Tallerea',
  description: 'Encuentra talleres de artes visuales, teatro, danza y música en Chile. Filtra por tipo, comuna, precio y horario.',
}

interface PageProps {
  searchParams: Promise<{
    tipo?: string
    modalidad?: string
    dia?: string
    comuna?: string
    precioMax?: string
    page?: string
  }>
}

async function WorkshopResults({ searchParams }: { searchParams: PageProps['searchParams'] }) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const filters = {
    tipo: params.tipo || undefined,
    modalidad: params.modalidad || undefined,
    dia: params.dia || undefined,
    comuna: params.comuna || undefined,
    precioMax: params.precioMax ? Number(params.precioMax) : undefined,
  }

  const result = await WorkshopService.getAll(filters, page, 12)
  const totalPages = Math.ceil(result.total / 12)

  if (result.data.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-5xl mb-4">🔍</p>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">No encontramos talleres</h2>
        <p className="text-gray-500">Prueba ajustando los filtros o busca en otra comuna.</p>
      </div>
    )
  }

  return (
    <>
      <p className="text-sm text-gray-500 mb-4">{result.total} talleres encontrados</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {result.data.map((w) => {
          const loc = w.locationId as unknown as { nombre: string; comuna: string } | null
          const acc = w.accountId as unknown as { nombre: string; slug: string } | null
          return (
            <WorkshopCard
              key={String(w._id)}
              slug={w.slug}
              titulo={w.titulo}
              tipo={w.tipo}
              modalidad={w.modalidad}
              precio={w.precio}
              cupoDisponible={w.cupoDisponible}
              comuna={loc?.comuna}
              imagen={w.imagenes?.[0]}
              horarios={w.horarios}
              espacioNombre={acc?.nombre}
              espacioSlug={acc?.slug}
            />
          )
        })}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={`/talleres?${new URLSearchParams({
                ...(params.tipo && { tipo: params.tipo }),
                ...(params.modalidad && { modalidad: params.modalidad }),
                ...(params.dia && { dia: params.dia }),
                ...(params.comuna && { comuna: params.comuna }),
                ...(params.precioMax && { precioMax: params.precioMax }),
                page: String(p),
              }).toString()}`}
              className={`px-3 py-1 rounded text-sm ${
                p === page ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </>
  )
}

export default async function TalleresPage(props: PageProps) {
  return (
    <>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Buscar talleres</h1>

        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8">
          {/* Sidebar filtros */}
          <aside className="bg-white rounded-xl border border-gray-200 p-4 h-fit sticky top-20">
            <Suspense fallback={<div className="text-sm text-gray-400">Cargando filtros...</div>}>
              <SearchFilters />
            </Suspense>
          </aside>

          {/* Resultados */}
          <section>
            <Suspense fallback={
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1,2,3,4,5,6].map((i) => (
                  <div key={i} className="bg-gray-100 rounded-xl h-72 animate-pulse" />
                ))}
              </div>
            }>
              <WorkshopResults searchParams={props.searchParams} />
            </Suspense>
          </section>
        </div>
      </main>
      <Footer />
    </>
  )
}
