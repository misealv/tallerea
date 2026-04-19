import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { WorkshopService } from '@/services/WorkshopService'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const workshop = await WorkshopService.getBySlug(slug)
  if (!workshop) return { title: 'Tallerea' }
  const loc = workshop.locationId as unknown as { comuna?: string } | null
  return {
    title: `${workshop.titulo}${loc?.comuna ? ` en ${loc.comuna}` : ''} — Tallerea`,
    description: workshop.descripcion.slice(0, 155),
    openGraph: {
      title: workshop.titulo,
      description: workshop.descripcion.slice(0, 155),
      images: workshop.imagenes?.[0] ? [workshop.imagenes[0]] : [],
    },
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

  const loc = workshop.locationId as unknown as {
    nombre: string; direccion: string; comuna: string; ciudad: string
  } | null
  const acc = workshop.accountId as unknown as {
    nombre: string; slug: string; tipo: string; verificado: boolean
  } | null

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-4 flex gap-1">
          <Link href="/talleres" className="hover:text-purple-600">Talleres</Link>
          <span>/</span>
          <span className="text-gray-800">{workshop.titulo}</span>
        </nav>

        {/* Imagen hero */}
        <div className="h-64 md:h-80 bg-gray-100 rounded-xl flex items-center justify-center text-7xl mb-6 overflow-hidden relative">
          {workshop.imagenes?.[0]
            ? <Image src={workshop.imagenes[0]} alt={workshop.titulo} fill className="object-cover" sizes="(max-width: 768px) 100vw, 800px" />
            : tipoIcon[workshop.tipo] || '✨'}
        </div>

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
            </div>

            <div className="prose prose-gray max-w-none">
              <p className="whitespace-pre-line text-gray-700">{workshop.descripcion}</p>
            </div>

            {/* Horarios (slots) */}
            {workshop.slots && workshop.slots.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Horarios</h2>
                <div className="space-y-2">
                  {workshop.slots.map((s: { dia: string; horaInicio: string; horaFin: string; cupoMax?: number; cupoDisponible?: number }, i: number) => {
                    const cupoMax = s.cupoMax ?? 0
                    const cupoDisp = s.cupoDisponible ?? 0
                    const full = cupoDisp <= 0
                    const pct = cupoMax > 0 ? ((cupoMax - cupoDisp) / cupoMax) * 100 : 100
                    return (
                      <div key={i} className={`flex items-center gap-3 rounded-lg px-4 py-2 ${full ? 'bg-red-50' : 'bg-gray-50'}`}>
                        <span className="font-medium text-gray-700 w-24">{diaLabel[s.dia] || s.dia}</span>
                        <span className="text-gray-600">{s.horaInicio} — {s.horaFin}</span>
                        <div className="ml-auto flex items-center gap-2">
                          <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${full ? 'bg-red-400' : pct > 80 ? 'bg-orange-400' : 'bg-green-400'}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`text-xs ${full ? 'text-red-500' : 'text-gray-500'}`}>
                            {full ? 'Lleno' : `${cupoDisp} cupos`}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

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
              </div>
            )}
          </div>

          {/* Sidebar derecha */}
          <div className="space-y-4">
            {/* Card de precio */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-20 space-y-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-700">
                  {workshop.precio === 0 ? 'Gratis' : `$${workshop.precio.toLocaleString('es-CL')}`}
                </p>
              </div>

              <div className="text-sm space-y-2 text-gray-600">
                {workshop.slots && workshop.slots.length > 0 ? (
                  <div className="flex justify-between">
                    <span>Cupos disponibles</span>
                    <span className={`font-medium ${
                      workshop.slots.reduce((s: number, sl: { cupoDisponible?: number }) => s + (sl.cupoDisponible ?? 0), 0) > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {workshop.slots.reduce((s: number, sl: { cupoDisponible?: number }) => s + (sl.cupoDisponible ?? 0), 0)} total
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span>Cupos disponibles</span>
                    <span className={`font-medium ${workshop.cupoDisponible > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {workshop.cupoDisponible} / {workshop.cupoMax}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Inicio</span>
                  <span className="font-medium">{new Date(workshop.fechaInicio).toLocaleDateString('es-CL')}</span>
                </div>
                {workshop.fechaFin && (
                  <div className="flex justify-between">
                    <span>Término</span>
                    <span className="font-medium">{new Date(workshop.fechaFin).toLocaleDateString('es-CL')}</span>
                  </div>
                )}
              </div>

              {(() => {
                const hasSlots = workshop.slots && workshop.slots.length > 0
                const totalCupos = hasSlots
                  ? workshop.slots.reduce((s: number, sl: { cupoDisponible?: number }) => s + (sl.cupoDisponible ?? 0), 0)
                  : workshop.cupoDisponible
                return totalCupos > 0 ? (
                  <Link
                    href={`/talleres/${workshop.slug}/inscribirse`}
                    className="block w-full text-center bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors"
                  >
                    Inscribirme
                  </Link>
                ) : (
                  <div className="w-full text-center bg-gray-200 text-gray-500 py-3 rounded-lg font-semibold">
                    Sin cupos
                  </div>
                )
              })()}
            </div>

            {/* Espacio */}
            {acc && (
              <Link
                href={`/espacios/${acc.slug}`}
                className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow transition-shadow"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 font-bold">
                    {acc.nombre.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 flex items-center gap-1">
                      {acc.nombre}
                      {acc.verificado && <span className="text-blue-500" title="Verificado">✓</span>}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">{acc.tipo}</p>
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
