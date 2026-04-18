import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { AccountService } from '@/services/AccountService'
import { WorkshopService } from '@/services/WorkshopService'
import { LocationService } from '@/services/LocationService'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import WorkshopCard from '@/components/WorkshopCard'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const account = await AccountService.getBySlug(slug)
  if (!account) return { title: 'Tallerea' }
  return {
    title: `${account.nombre} — Tallerea`,
    description: account.bio?.slice(0, 155) || `${account.nombre} en Tallerea`,
    openGraph: {
      title: account.nombre,
      description: account.bio?.slice(0, 155) || '',
      images: account.logo ? [account.logo] : [],
    },
  }
}

const espLabel: Record<string, string> = {
  visual: '🎨 Visual', teatro: '🎭 Teatro', danza: '💃 Danza', musica: '🎵 Música', otro: '✨ Otro',
}

export default async function EspacioPage({ params }: PageProps) {
  const { slug } = await params
  const account = await AccountService.getBySlug(slug)
  if (!account) notFound()

  const [workshops, locationsResult] = await Promise.all([
    WorkshopService.getAll({ accountId: String(account._id) }, 1, 50),
    LocationService.getByAccountId(String(account._id)),
  ])
  const locations = locationsResult.data

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center text-2xl font-bold text-purple-700 shrink-0 relative overflow-hidden">
            {account.logo
              ? <Image src={account.logo} alt={account.nombre} fill className="object-cover" sizes="64px" />
              : account.nombre.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              {account.nombre}
              {account.verificado && <span className="text-blue-500 text-lg" title="Verificado">✓</span>}
            </h1>
            <p className="text-sm text-gray-500 capitalize">{account.tipo}</p>
          </div>
        </div>

        {/* Bio */}
        {account.bio && (
          <p className="text-gray-700 mb-6 whitespace-pre-line">{account.bio}</p>
        )}

        {/* Especialidades */}
        {account.especialidades.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {account.especialidades.map((e) => (
              <span key={e} className="text-xs bg-purple-50 text-purple-700 px-3 py-1 rounded-full">
                {espLabel[e] || e}
              </span>
            ))}
          </div>
        )}

        {/* Redes sociales */}
        {account.redesSociales && (
          <div className="flex gap-4 mb-8 text-sm">
            {account.redesSociales.instagram && (
              <a href={`https://instagram.com/${account.redesSociales.instagram}`} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-purple-600">
                📷 @{account.redesSociales.instagram}
              </a>
            )}
            {account.redesSociales.web && (
              <a href={account.redesSociales.web} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-purple-600">
                🌐 Sitio web
              </a>
            )}
          </div>
        )}

        {/* Sedes */}
        {locations.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Sedes</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {locations.map((l) => (
                <div key={String(l._id)} className="bg-gray-50 rounded-lg p-3">
                  <p className="font-medium text-gray-800">{l.nombre}</p>
                  <p className="text-sm text-gray-500">{l.direccion}, {l.comuna}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Talleres */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Talleres ({workshops.total})
          </h2>
          {workshops.data.length === 0 ? (
            <p className="text-gray-500">Este espacio aún no tiene talleres publicados.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {workshops.data.map((w) => {
                const loc = w.locationId as unknown as { comuna?: string } | null
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
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Volver */}
        <div className="mt-8">
          <Link href="/talleres" className="text-sm text-purple-600 hover:underline">
            ← Volver a la búsqueda
          </Link>
        </div>
      </main>
      <Footer />
    </>
  )
}
