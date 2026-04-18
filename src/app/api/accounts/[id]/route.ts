import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { AccountService } from '@/services/AccountService'
import { validateObjectId } from '@/lib/validate'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!validateObjectId(params.id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }
    const account = await AccountService.getById(params.id)
    if (!account) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json(account)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!validateObjectId(params.id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  // Ownership check
  const account = await AccountService.getById(params.id)
  if (!account) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (account.ownerId.toString() !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No tienes permiso' }, { status: 403 })
  }

  try {
    const body = await req.json()
    // No permitir cambiar ownerId ni slug desde PUT
    delete body.ownerId
    delete body.slug
    const updated = await AccountService.update(params.id, body)
    return NextResponse.json(updated)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status = message.includes('no encontrado') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
