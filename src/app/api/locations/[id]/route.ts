import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { LocationService } from '@/services/LocationService'
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
    const location = await LocationService.getById(params.id)
    if (!location) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    return NextResponse.json(location)
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

  // Ownership check vía account
  const location = await LocationService.getById(params.id)
  if (!location) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const account = await AccountService.getById(location.accountId.toString())
  if (!account || (account.ownerId.toString() !== session.user.id && session.user.role !== 'admin')) {
    return NextResponse.json({ error: 'No tienes permiso' }, { status: 403 })
  }

  try {
    const body = await req.json()
    delete body.accountId // No permitir cambiar de account
    const updated = await LocationService.update(params.id, body)
    return NextResponse.json(updated)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status = message.includes('no encontrada') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!validateObjectId(params.id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const location = await LocationService.getById(params.id)
  if (!location) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const account = await AccountService.getById(location.accountId.toString())
  if (!account || (account.ownerId.toString() !== session.user.id && session.user.role !== 'admin')) {
    return NextResponse.json({ error: 'No tienes permiso' }, { status: 403 })
  }

  try {
    await LocationService.delete(params.id)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
