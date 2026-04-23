import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { LocationService } from '@/services/LocationService'
import { validateRequired, validateObjectId } from '@/lib/validate'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const ownerId = searchParams.get('ownerId')
    const page = Number(searchParams.get('page')) || 1
    const limit = Number(searchParams.get('limit')) || 20

    if (ownerId) {
      if (!validateObjectId(ownerId)) {
        return NextResponse.json({ error: 'ownerId inválido' }, { status: 400 })
      }
      const result = await LocationService.getByOwnerId(ownerId, page, limit)
      return NextResponse.json(result)
    }

    const result = await LocationService.getAll({}, page, limit)
    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await req.json()

    const missing = validateRequired(body, ['nombre', 'direccion', 'comuna', 'ciudad'])
    if (missing) return NextResponse.json({ error: missing }, { status: 400 })

    // Ownership: la location pertenece al usuario autenticado
    body.ownerId = session.user.id

    const location = await LocationService.create(body)
    return NextResponse.json(location, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
