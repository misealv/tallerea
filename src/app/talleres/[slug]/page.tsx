import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { WorkshopService } from '@/services/WorkshopService'
import { SiteConfigService } from '@/services/SiteConfigService'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import PrecioCard from '@/components/PrecioCard'

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

const diaSemanaCorto = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function formatFechaSlot(fecha: Date): { dia: string; fecha: string } {
  const d = new Date(fecha)
  return {
    dia: diaSemanaCorto[d.getDay()],
    fecha: d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }),
  }
}

export default async function WorkshopDetailPage({ params }: PageProps) {
  const { slug } = await params
  const workshop = await WorkshopService.getBySlug(slug)
  if (!workshop) notFound()

  const comisionPct = await SiteConfigService.getComisionPct()

  const loc = workshop.locationId as unknown as {
    nombre: string; direccion: string; comuna: string; ciudad: string
  } | null
  const owner = workshop.ownerId as unknown as {
    name: string; taller?: { slug?: string; bio?: string }
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
            {(() => {
              const now = new Date()
              const cupo = workshop.cupoPorSesion || 0

              // Slots concretos con fecha, futuros y no cancelados
              const slotsFuturos = (workshop.slots || [])
                .filter((s: { fecha?: Date; cancelado?: boolean }) =>
                  s.fecha && new Date(s.fecha) > now && !s.cancelado
                )
                .sort((a: { fecha?: Date }, b: { fecha?: Date }) =>
                  new Date(a.fecha!).getTime() - new Date(b.fecha!).getTime()
                )

              const proximos = slotsFuturos.slice(0, 10)
              const restantes = slotsFuturos.length - proximos.length

              // Plantilla semanal (patrón) — si no hay slots con fecha
              const plantilla = workshop.plantillaSemanal || []
              const slotsSinFecha = (workshop.slots || []).filter(
                (s: { fecha?: Date; dia?: string }) => !s.fecha && s.dia
              )

              if (proximos.length === 0 && plantilla.length === 0 && slotsSinFecha.length === 0) {
                return null
              }

              return (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">
                    {proximos.length > 0 ? 'Próximas sesiones disponibles' : 'Horarios'}
                  </h2>

                  {proximos.length > 0 && (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {proximos.map((s: { fecha?: Date; horaInicio: string; horaFin: string; reservas: number }, i: number) => {
                          const disponible = cupo - (s.reservas || 0)
                          const lleno = disponible <= 0
                          const fmt = formatFechaSlot(s.fecha!)
                          return (
                            <div
                              key={i}
                              className={`rounded-lg border px-3 py-2 ${
                                lleno ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-purple-200 bg-purple-50'
                              }`}
                            >
                              <div className="text-xs text-gray-500 capitalize">{fmt.dia}</div>
                              <div className="font-semibold text-gray-900 text-sm">{fmt.fecha}</div>
                              <div className="text-sm text-gray-700">{s.horaInicio} – {s.horaFin}</div>
                              <div className={`text-xs mt-1 ${lleno ? 'text-red-600' : 'text-green-700'}`}>
                                {lleno ? 'Sin cupos' : `${disponible} de ${cupo} disponibles`}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {restantes > 0 && (
                        <p className="text-sm text-gray-500 mt-2">
                          +{restantes} sesión{restantes === 1 ? '' : 'es'} más disponible{restantes === 1 ? '' : 's'}
                        </p>
                      )}
                    </>
                  )}

                  {proximos.length === 0 && (plantilla.length > 0 || slotsSinFecha.length > 0) && (
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
              paquetes={(workshop.paquetes ?? []).map((p: { _id: { toString(): string }; nombre: string; precio: number; sesionesIncluidas: number; duracionDias: number; activo: boolean }) => ({
                _id:               p._id.toString(),
                nombre:            p.nombre,
                precio:            p.precio,
                sesionesIncluidas: p.sesionesIncluidas,
                duracionDias:      p.duracionDias,
                activo:            p.activo,
              }))}
              clasePrueba={workshop.clasePrueba ? {
                habilitada: workshop.clasePrueba.habilitada,
                precio:     workshop.clasePrueba.precio,
              } : undefined}
              cupoPorSesion={workshop.cupoPorSesion}
              plan={workshop.plan ?? null}
              comisionPct={comisionPct}
            />

            {/* Tallerista */}
            {owner && (
              owner.taller?.slug
                ? (
                  <Link
                    href={`/talleristas/${owner.taller.slug}`}
                    className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow transition-shadow"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 font-bold">
                        {owner.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{owner.name}</p>
                        <p className="text-xs text-gray-500">Ver perfil del tallerista</p>
                      </div>
                    </div>
                  </Link>
                )
                : (
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 font-bold">
                        {owner.name.charAt(0)}
                      </div>
                      <p className="font-medium text-gray-900">{owner.name}</p>
                    </div>
                  </div>
                )
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
