import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const PEXELS_API_KEY = process.env.PEXELS_API_KEY

// Mapeo de tipo de taller a queries de búsqueda en inglés (mejores resultados)
const SEARCH_QUERIES: Record<string, string[]> = {
  visual: ['painting art class', 'art studio watercolor', 'drawing workshop creative'],
  teatro: ['theater stage performance', 'acting drama class', 'theater rehearsal'],
  danza: ['dance class studio', 'contemporary dance', 'ballet dance lesson'],
  musica: ['music class instrument', 'piano guitar lesson', 'music studio practice'],
  otro: ['creative workshop class', 'craft art workshop', 'art hands creative'],
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!PEXELS_API_KEY) {
    return NextResponse.json({ error: 'PEXELS_API_KEY no configurada' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get('tipo') || 'otro'
  const q = searchParams.get('q') || ''
  const page = Number(searchParams.get('page')) || 1

  // Usar query personalizada o la del mapeo por tipo
  const queries = SEARCH_QUERIES[tipo] || SEARCH_QUERIES.otro
  const baseQuery = q.trim() || queries[Math.floor(Math.random() * queries.length)]

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(baseQuery)}&per_page=12&page=${page}&orientation=landscape`,
      { headers: { Authorization: PEXELS_API_KEY } }
    )

    if (!res.ok) {
      return NextResponse.json({ error: 'Error al buscar imágenes' }, { status: 502 })
    }

    const data = await res.json()

    const images = data.photos?.map((photo: {
      id: number
      src: { medium: string; large: string; original: string }
      photographer: string
      alt: string
    }) => ({
      id: photo.id,
      thumb: photo.src.medium,
      full: photo.src.large,
      photographer: photo.photographer,
      alt: photo.alt || '',
    })) || []

    return NextResponse.json({
      images,
      totalResults: data.total_results || 0,
      page,
    })
  } catch {
    return NextResponse.json({ error: 'Error de conexión con Pexels' }, { status: 500 })
  }
}
