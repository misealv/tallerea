import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const MODEL = 'claude-haiku-4-5-20251001'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'API de IA no configurada' }, { status: 500 })
  }

  try {
    const { titulo, tipo, modalidad, descripcionActual, accion, tipoCuenta } = await req.json()

    if (!titulo || !tipo) {
      return NextResponse.json({ error: 'Título y tipo son requeridos' }, { status: 400 })
    }

    // Instrucción de voz según tipo de cuenta
    const vozInstruccion = tipoCuenta === 'institucion'
      ? 'Redacta en voz institucional usando "nosotros/nuestro". Por ejemplo: "En nuestro espacio ofrecemos...", "Nuestros talleres se caracterizan por...".'
      : 'Redacta en primera persona singular usando "yo/mi". Por ejemplo: "En este taller te enseñaré...", "Mi metodología se basa en...".'

    const prompts: Record<string, string> = {
      generar: `Eres un redactor experto en talleres de artes en Chile. Genera una descripción atractiva para un taller con estos datos:
- Título: ${titulo}
- Tipo: ${tipo}
- Modalidad: ${modalidad || 'presencial'}

${vozInstruccion}

Escribe en español chileno, máximo 3 párrafos. Incluye: qué aprenderán, para quién es ideal, y qué materiales o experiencia se necesitan. Tono cercano y profesional. No uses emojis. No repitas el título.`,

      mejorar: `Eres un redactor experto en talleres de artes en Chile. Mejora esta descripción de taller haciéndola más atractiva y completa:

Título: ${titulo}
Tipo: ${tipo}
Descripción actual: ${descripcionActual}

${vozInstruccion}

Reescribe en español chileno, máximo 3 párrafos. Mantén la esencia pero mejora claridad, atractivo y estructura. Tono cercano y profesional.`,

      resumir: `Resume esta descripción de taller en máximo 2 oraciones claras y atractivas para usar como preview:

Título: ${titulo}
Descripción: ${descripcionActual}

${vozInstruccion}
Escribe en español chileno. Tono profesional.`,
    }

    const prompt = prompts[accion] || prompts.generar

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic error:', err)
      return NextResponse.json({ error: 'Error al generar texto' }, { status: 502 })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''

    return NextResponse.json({ text })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
