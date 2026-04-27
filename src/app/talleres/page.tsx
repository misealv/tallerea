import { Suspense } from 'react'
import { WorkshopService } from '@/services/WorkshopService'
import { SiteConfigService } from '@/services/SiteConfigService'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import WorkshopCard from '@/components/WorkshopCard'
import SearchFilters from '@/components/SearchFilters'

export const revalidate = 300 // 5 min — listado se mantiene fresco sin penalizar performance

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
    horario?: string
    edadRango?: string
    modeloAcceso?: string
    clasePrueba?: string
    conCupo?: string
    page?: string
  }>
}

async function WorkshopResults({ searchParams }: { searchParams: PageProps['searchParams'] }) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const filters = {
    tipo:         params.tipo || undefined,
    modalidad:    params.modalidad || undefined,
    dia:          params.dia || undefined,
    comuna:       params.comuna || undefined,
    precioMax:    params.precioMax ? Number(params.precioMax) : undefined,
    horario:      params.horario as 'manana' | 'tarde' | 'noche' | undefined || undefined,
    edadRango:    params.edadRango as 'infantil' | 'jovenes' | 'adultos' | undefined || undefined,
    modeloAcceso: params.modeloAcceso as 'puntual' | 'recurrente' | undefined || undefined,
    clasePrueba:  params.clasePrueba === '1' ? true : undefined,
    conCupo:      params.conCupo === '1' ? true : undefined,
  }

  const result = await WorkshopService.getAll(filters, page, 12)
  const comisionPct = await SiteConfigService.getComisionPct()
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
        {result.data.map((w, i) => {
          const loc = w.locationId as unknown as { nombre: string; comuna: string } | null
          const acc = w.accountId as unknown as { nombre: string; slug: string; precioModalidad?: string } | null
          const owner = w.ownerId as unknown as { name: string } | null
          const esNeto = acc?.precioModalidad === 'neto' || w.precioModalidad === 'neto'
          const toBruto = (n: number) => esNeto && n > 0 ? Math.round(n * 100 / (100 - comisionPct)) : n
          const precioPublico = toBruto(w.precio ?? 0)
          const candidatos: number[] = w.modalidadPrecio === 'paquetes' ? [] : [precioPublico]
          if (w.paquetes?.length) {
            w.paquetes.forEach((p: { precio: number; activo: boolean }) => {
              if (p.activo) candidatos.push(toBruto(p.precio))
            })
          }
          const precioDesde = candidatos.length > 0 ? Math.min(...candidatos) : precioPublico
          return (
            <WorkshopCard
              key={String(w._id)}
              slug={w.slug}
              titulo={w.titulo}
              tipo={w.tipo}
              modalidad={w.modalidad}
              precio={precioPublico}
              precioDesde={precioDesde}
              cupoPorSesion={w.cupoPorSesion}
              talleristaNombre={owner?.name}
              clasePruebaDisponible={!!w.clasePrueba?.habilitada}
              clasePruebaPrecio={w.clasePrueba?.precio}
              modeloAcceso={w.modeloAcceso}
              comuna={loc?.comuna}
              imagen={w.imagenes?.[0]}
              slots={w.slots}
              espacioNombre={acc?.nombre}
              espacioSlug={acc?.slug}
              priority={i < 3}
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
                ...(params.horario && { horario: params.horario }),
                ...(params.edadRango && { edadRango: params.edadRango }),
                ...(params.modeloAcceso && { modeloAcceso: params.modeloAcceso }),
                ...(params.clasePrueba && { clasePrueba: params.clasePrueba }),
                ...(params.conCupo && { conCupo: params.conCupo }),
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
