import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { WorkshopService } from '@/services/WorkshopService'
import { TallerService } from '@/services/TallerService'
import { validateRequired, validateObjectId, validateEnum } from '@/lib/validate'
import { generateSlug, ensureUniqueSlug } from '@/lib/slugify'
import Workshop, { WORKSHOP_TIPOS } from '@/models/Workshop'
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
      modeloAcceso: searchParams.get('modeloAcceso') || undefined,
      dia: searchParams.get('dia') || undefined,
      ownerId: searchParams.get('ownerId') || undefined,
      precioMin: searchParams.get('precioMin') ? Number(searchParams.get('precioMin')) : undefined,
      precioMax: searchParams.get('precioMax') ? Number(searchParams.get('precioMax')) : undefined,
      includeInactive: searchParams.get('includeInactive') === 'true' ? true : undefined,
    }

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
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await req.json()

    const missing = validateRequired(body, ['titulo', 'descripcion', 'tipo', 'modalidad', 'precio', 'fechaInicio'])
    if (missing) return NextResponse.json({ error: missing }, { status: 400 })

    const badTipo = validateEnum(body.tipo, [...WORKSHOP_TIPOS], 'tipo')
    if (badTipo) return NextResponse.json({ error: badTipo }, { status: 400 })

    const badMod = validateEnum(body.modalidad, ['presencial', 'online', 'hibrido'], 'modalidad')
    if (badMod) return NextResponse.json({ error: badMod }, { status: 400 })

    // ownerId siempre viene de la sesión para evitar suplantación
    const ownerId = session.user.id

    // [TALLER ESTADO] Verificar tallerista aprobado
    const taller = await TallerService.getById(ownerId)
    if (!taller || taller.taller?.estado !== 'aprobado') {
      if (session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Solo talleristas aprobados pueden publicar talleres' }, { status: 403 })
      }
    }

    const badAcceso = validateEnum(body.modeloAcceso, ['puntual', 'recurrente'], 'modeloAcceso')
    if (badAcceso) return NextResponse.json({ error: badAcceso }, { status: 400 })

    await dbConnect()
    const baseSlug = generateSlug(body.titulo)
    const slug = await ensureUniqueSlug(baseSlug, Workshop)

    const workshop = await WorkshopService.create({ ...body, ownerId, slug })
    return NextResponse.json(workshop, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

