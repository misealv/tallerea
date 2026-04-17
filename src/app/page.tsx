import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <Link href="/" className="text-2xl font-bold text-purple-700">
          Tallerea
        </Link>
        <div className="flex gap-4 items-center">
          <Link href="/talleres" className="text-gray-600 hover:text-purple-700">
            Explorar talleres
          </Link>
          <Link
            href="/login"
            className="px-4 py-2 text-purple-700 border border-purple-700 rounded-lg hover:bg-purple-50"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/registro"
            className="px-4 py-2 bg-purple-700 text-white rounded-lg hover:bg-purple-800"
          >
            Registrarse
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-7xl mx-auto px-6 py-20 text-center">
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

      {/* Footer */}
      <footer className="text-center py-8 text-gray-400 text-sm">
        © 2026 Tallerea.cl — Encuentra tu taller de arte
      </footer>
    </div>
  );
}
