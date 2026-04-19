import Link from "next/link";
import { WorkshopService } from "@/services/WorkshopService";
import { SiteConfigService } from "@/services/SiteConfigService";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WorkshopCard from "@/components/WorkshopCard";

export const dynamic = 'force-dynamic'

export default async function Home() {
  const featured = await WorkshopService.getAll({}, 1, 6);
  const comisionPct = await SiteConfigService.getComisionPct();

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
        {/* Hero */}
        <main className="max-w-6xl mx-auto px-4 py-20 text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Encuentra tu taller de arte
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            Conectamos talleristas e instituciones de artes visuales, teatro, danza y música
            con personas que buscan talleres en Chile.
          </p>

          {/* Categorías */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-3xl mx-auto mb-16">
            {[
              { name: "Artes Visuales", emoji: "🎨", slug: "visual" },
              { name: "Teatro", emoji: "🎭", slug: "teatro" },
              { name: "Danza", emoji: "💃", slug: "danza" },
              { name: "Música", emoji: "🎵", slug: "musica" },
              { name: "Otros", emoji: "✨", slug: "otro" },
            ].map((cat) => (
              <Link
                key={cat.slug}
                href={`/talleres?tipo=${cat.slug}`}
                className="flex flex-col items-center p-6 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-100"
              >
                <span className="text-4xl mb-2">{cat.emoji}</span>
                <span className="text-sm font-medium text-gray-700">{cat.name}</span>
              </Link>
            ))}
          </div>

          {/* Talleres destacados */}
          {featured.data.length > 0 && (
            <section className="text-left mb-16">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Talleres recientes</h2>
                <Link href="/talleres" className="text-sm text-purple-600 hover:underline">
                  Ver todos →
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {featured.data.map((w) => {
                  const loc = w.locationId as unknown as { comuna?: string } | null;
                  const acc = w.accountId as unknown as { nombre: string; slug: string; precioModalidad?: string } | null;
                  const precioPublico = (acc?.precioModalidad === 'neto' || w.precioModalidad === 'neto')
                    ? Math.round(w.precio * 100 / (100 - comisionPct))
                    : w.precio;
                  return (
                    <WorkshopCard
                      key={String(w._id)}
                      slug={w.slug}
                      titulo={w.titulo}
                      tipo={w.tipo}
                      modalidad={w.modalidad}
                      precio={precioPublico}
                      cupoPorSesion={w.cupoPorSesion}
                      comuna={loc?.comuna}
                      imagen={w.imagenes?.[0]}
                      slots={w.slots}
                      espacioNombre={acc?.nombre}
                      espacioSlug={acc?.slug}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* CTA para talleristas */}
          <div className="bg-purple-700 text-white rounded-2xl p-10 max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-4">¿Eres tallerista o institución?</h2>
            <p className="text-purple-200 mb-6">
              Publica tus talleres gratis y llega a más alumnos.
            </p>
            <Link
              href="/registro"
              className="inline-block px-8 py-3 bg-white text-purple-700 font-semibold rounded-lg hover:bg-purple-50"
            >
              Crear mi espacio
            </Link>
          </div>
        </main>
      </div>
      <Footer />
    </>
  );
}
