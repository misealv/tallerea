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
            Encuentra tus talleres de<br className="hidden sm:block" />{' '}
            <span className="text-purple-600">cultura, artes y oficios</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            Conectamos talleristas e instituciones de artes visuales, teatro, danza y música
            con personas que buscan talleres en Chile.
          </p>

          {/* Categorías */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 max-w-4xl mx-auto mb-16">
            {[
              { name: "Artes Visuales", emoji: "🎨", slug: "visual" },
              { name: "Teatro",         emoji: "🎭", slug: "teatro" },
              { name: "Danza",          emoji: "💃", slug: "danza" },
              { name: "Música",         emoji: "🎵", slug: "musica" },
              { name: "Cerámica",       emoji: "🏺", slug: "ceramica" },
              { name: "Yoga",           emoji: "🧘", slug: "yoga" },
              { name: "Cocina",         emoji: "🍳", slug: "cocina" },
              { name: "Manualidades",   emoji: "✂️", slug: "manualidades" },
              { name: "Fotografía",     emoji: "📷", slug: "fotografia" },
              { name: "Escritura",      emoji: "✍️", slug: "escritura" },
              { name: "Bienestar",      emoji: "🌿", slug: "bienestar" },
              { name: "Tecnología",     emoji: "💻", slug: "tecnologia" },
              { name: "Idiomas",        emoji: "🗣️", slug: "idiomas" },
              { name: "Infantil",       emoji: "🧸", slug: "infantil" },
              { name: "Otros",          emoji: "✨", slug: "otro" },
            ].map((cat) => (
              <Link
                key={cat.slug}
                href={`/talleres?tipo=${cat.slug}`}
                className="flex flex-col items-center p-4 bg-white rounded-xl shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-purple-200 active:scale-95 transition-all duration-200 border border-gray-100"
              >
                <span className="text-3xl mb-1.5">{cat.emoji}</span>
                <span className="text-xs font-medium text-gray-700 text-center leading-tight">{cat.name}</span>
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
                {featured.data.map((w, i) => {
                  const loc = w.locationId as unknown as { comuna?: string } | null;
                  const acc = w.accountId as unknown as { nombre: string; slug: string; precioModalidad?: string } | null;
                  const owner = w.ownerId as unknown as { name: string } | null;
                  const esNeto = acc?.precioModalidad === 'neto' || w.precioModalidad === 'neto'
                  const toBruto = (n: number) => esNeto && n > 0 ? Math.round(n * 100 / (100 - comisionPct)) : n
                  const precioPublico = toBruto(w.precio ?? 0)

                  // Precio desde: mínimo entre precio fijo y paquetes (sin clase de prueba)
                  // Si modalidadPrecio es 'paquetes', el precio base es 0 → no incluirlo
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
                      comuna={loc?.comuna}
                      imagen={w.imagenes?.[0]}
                      slots={w.slots}
                      espacioNombre={acc?.nombre}
                      espacioSlug={acc?.slug}
                      talleristaNombre={owner?.name}
                      clasePruebaDisponible={!!w.clasePrueba?.habilitada}
                      clasePruebaPrecio={w.clasePrueba?.precio}
                      priority={i < 3}
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
