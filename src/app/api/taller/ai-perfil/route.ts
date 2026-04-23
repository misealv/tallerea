import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const MODEL = 'claude-haiku-4-5-20251001'

type Campo = 'bio' | 'formacion' | 'credenciales'

const PROMPTS: Record<Campo, (datos: string, especialidades: string) => string> = {
  bio: (datos, especialidades) =>
    `Eres un redactor experto en perfiles de artistas y talleristas chilenos. Completa y mejora esta biografía profesional basándote en los datos que el tallerista proporcionó.

Especialidades del tallerista: ${especialidades || 'artes'}
Datos proporcionados por el tallerista: "${datos}"

Redacta en primera persona, en español chileno, máximo 3 párrafos fluidos. La biografía debe:
- Presentar quién es y su trayectoria artística
- Transmitir su pasión y metodología de enseñanza
- Conectar emocionalmente con potenciales alumnos
- Sonar natural y auténtico, no genérico

Tono cercano, profesional y motivador. No uses emojis ni listas. No inventes logros concretos (fechas, premios específicos) que no estén en los datos.`,

  formacion: (datos, especialidades) =>
    `Eres un redactor experto en perfiles de artistas y talleristas chilenos. Redacta la sección de formación académica y trayectoria de este tallerista.

Especialidades: ${especialidades || 'artes'}
Información proporcionada: "${datos}"

Redacta en primera persona, en español chileno, 2-3 párrafos. La sección debe:
- Describir su formación académica y autodidacta
- Mencionar hitos de aprendizaje relevantes
- Mostrar su desarrollo y evolución profesional

Tono profesional y claro. No inventes instituciones o fechas concretas que no estén en los datos.`,

  credenciales: (datos, especialidades) =>
    `Eres un redactor experto en perfiles de artistas y talleristas chilenos. Redacta la sección de credenciales y logros de este tallerista.

Especialidades: ${especialidades || 'artes'}
Información proporcionada: "${datos}"

Redacta en primera persona, en español chileno, 2-3 párrafos o lista clara. La sección debe:
- Destacar certificaciones, títulos y reconocimientos
- Mencionar experiencia docente relevante
- Transmitir autoridad y confianza

Tono profesional y conciso. Solo incluye lo que está en los datos proporcionados.`,
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (session.user.tallerEstado !== 'aprobado') {
    return NextResponse.json({ error: 'Solo talleristas aprobados' }, { status: 403 })
  }
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'API de IA no configurada' }, { status: 500 })
  }

  try {
    const { campo, datos, especialidades } = await req.json()

    if (!campo || !datos || typeof datos !== 'string' || datos.trim().length < 10) {
      return NextResponse.json({ error: 'Proporciona al menos 10 caracteres de datos' }, { status: 400 })
    }
    if (!['bio', 'formacion', 'credenciales'].includes(campo)) {
      return NextResponse.json({ error: 'Campo inválido' }, { status: 400 })
    }

    const prompt = PROMPTS[campo as Campo](datos.trim(), especialidades ?? '')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic error:', err)
      return NextResponse.json({ error: 'Error al generar texto' }, { status: 502 })
    }

    const data = await response.json()
    const texto = data.content?.[0]?.text?.trim() ?? ''
    return NextResponse.json({ texto })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
