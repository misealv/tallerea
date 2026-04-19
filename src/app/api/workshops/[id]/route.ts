import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { WorkshopService } from '@/services/WorkshopService'
import { AccountService } from '@/services/AccountService'
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

    // Buscar incluyendo inactivos para poder reactivar
    const workshop = await WorkshopService.getByIdIncludingInactive(params.id)
    if (!workshop) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    // Ownership check vía account
    const account = await AccountService.getById(workshop.accountId.toString())
    if (!account || (account.ownerId.toString() !== session.user.id && session.user.role !== 'admin')) {
      return NextResponse.json({ error: 'No tienes permiso' }, { status: 403 })
    }

    const body = await req.json()
    delete body.accountId
    delete body.slug

    // Limpiar campos vacíos que Mongoose no puede castear a ObjectId
    if (!body.locationId) delete body.locationId
    if (!body.instructorId) delete body.instructorId

    const updated = await WorkshopService.update(params.id, body)
    return NextResponse.json(updated)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    console.error('[workshops/PUT]', message)
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

    const account = await AccountService.getById(workshop.accountId.toString())
    if (!account || (account.ownerId.toString() !== session.user.id && session.user.role !== 'admin')) {
      return NextResponse.json({ error: 'No tienes permiso' }, { status: 403 })
    }

    await WorkshopService.delete(params.id)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    console.error('[workshops/DELETE]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
