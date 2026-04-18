import Link from 'next/link'

const tiposArte = ['Visual', 'Teatro', 'Danza', 'Música']

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 mt-16">
      <div className="max-w-6xl mx-auto px-4 py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h3 className="text-white text-lg font-bold mb-3">Tallerea</h3>
          <p className="text-sm">Encuentra tu taller de arte en Chile. Conectamos talleristas con alumnos.</p>
        </div>
        <div>
          <h4 className="text-white text-sm font-semibold mb-3">Explorar</h4>
          <ul className="space-y-2 text-sm">
            {tiposArte.map((t) => (
              <li key={t}>
                <Link href={`/talleres?tipo=${t.toLowerCase()}`} className="hover:text-white">
                  Talleres de {t}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-white text-sm font-semibold mb-3">¿Eres tallerista?</h4>
          <p className="text-sm mb-3">Publica tus talleres y llena tus cupos.</p>
          <Link
            href="/registro"
            className="inline-block text-sm bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
          >
            Crear espacio gratis
          </Link>
        </div>
      </div>
      <div className="border-t border-gray-800 text-center py-4 text-xs">
        © {new Date().getFullYear()} Tallerea.cl — Todos los derechos reservados.
      </div>
    </footer>
  )
}
