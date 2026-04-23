import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { WorkshopService } from '@/services/WorkshopService'
import { validateObjectId } from '@/lib/validate'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!validateObjectId(params.id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }
    const workshop = await WorkshopService.getById(params.id)
    if (!workshop) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json(workshop)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    if (!validateObjectId(params.id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const workshop = await WorkshopService.getByIdIncludingInactive(params.id)
    if (!workshop) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    // Ownership: admin o dueño directo
    const isAdmin = session.user.role === 'admin'
    const isOwner = workshop.ownerId?.toString() === session.user.id
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'No tienes permiso' }, { status: 403 })
    }

    const body = await req.json()
    delete body.ownerId
    delete body.slug
    if (!body.locationId) delete body.locationId

    const updated = await WorkshopService.update(params.id, body)
    return NextResponse.json(updated)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status = message.includes('no encontrado') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    if (!validateObjectId(params.id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const workshop = await WorkshopService.getByIdIncludingInactive(params.id)
    if (!workshop) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    const isAdmin = session.user.role === 'admin'
    const isOwner = workshop.ownerId?.toString() === session.user.id
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'No tienes permiso' }, { status: 403 })
    }

    await WorkshopService.delete(params.id)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

