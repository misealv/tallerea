import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { WorkshopService } from '@/services/WorkshopService'
import { AccountService } from '@/services/AccountService'
import { validateRequired, validateObjectId, validateEnum } from '@/lib/validate'
import { generateSlug, ensureUniqueSlug } from '@/lib/slugify'
import Workshop from '@/models/Workshop'
import dbConnect from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const page = Number(searchParams.get('page')) || 1
    const limit = Number(searchParams.get('limit')) || 20

    const filters: Record<string, unknown> = {
      tipo: searchParams.get('tipo') || undefined,
      modalidad: searchParams.get('modalidad') || undefined,
      dia: searchParams.get('dia') || undefined,
      accountId: searchParams.get('accountId') || undefined,
      precioMin: searchParams.get('precioMin') ? Number(searchParams.get('precioMin')) : undefined,
      precioMax: searchParams.get('precioMax') ? Number(searchParams.get('precioMax')) : undefined,
      includeInactive: searchParams.get('includeInactive') === 'true' ? true : undefined,
    }

    // Si piden por slug, devolver directo
    const slugParam = searchParams.get('slug')
    if (slugParam) {
      const workshop = await WorkshopService.getBySlug(slugParam)
      if (!workshop) return NextResponse.json({ data: [] })
      return NextResponse.json({ data: [workshop] })
    }

    const result = await WorkshopService.getAll(filters, page, limit)
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

    const missing = validateRequired(body, ['accountId', 'titulo', 'descripcion', 'tipo', 'modalidad', 'precio', 'cupoMax', 'fechaInicio'])
    if (missing) return NextResponse.json({ error: missing }, { status: 400 })

    if (!validateObjectId(body.accountId)) {
      return NextResponse.json({ error: 'accountId inválido' }, { status: 400 })
    }

    const badTipo = validateEnum(body.tipo, ['visual', 'teatro', 'danza', 'musica', 'otro'], 'tipo')
    if (badTipo) return NextResponse.json({ error: badTipo }, { status: 400 })

    const badMod = validateEnum(body.modalidad, ['presencial', 'online', 'hibrido'], 'modalidad')
    if (badMod) return NextResponse.json({ error: badMod }, { status: 400 })

    // Ownership
    const account = await AccountService.getById(body.accountId)
    if (!account) return NextResponse.json({ error: 'Espacio no encontrado' }, { status: 404 })
    if (account.ownerId.toString() !== session.user.id && session.user.role !== 'admin') {
      return NextResponse.json({ error: 'No tienes permiso' }, { status: 403 })
    }

    // Generar slug
    await dbConnect()
    const baseSlug = generateSlug(body.titulo)
    const slug = await ensureUniqueSlug(baseSlug, Workshop)

    const workshop = await WorkshopService.create({ ...body, slug })
    return NextResponse.json(workshop, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
