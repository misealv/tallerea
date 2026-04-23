import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { WorkshopService } from '@/services/WorkshopService'
import { AccountService } from '@/services/AccountService'
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
      accountId: searchParams.get('accountId') || undefined,
      ownerId: searchParams.get('ownerId') || undefined,
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
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await req.json()

    // Validaciones comunes
    const missing = validateRequired(body, ['titulo', 'descripcion', 'tipo', 'modalidad', 'precio', 'fechaInicio'])
    if (missing) return NextResponse.json({ error: missing }, { status: 400 })

    const badTipo = validateEnum(body.tipo, [...WORKSHOP_TIPOS], 'tipo')
    if (badTipo) return NextResponse.json({ error: badTipo }, { status: 400 })

    const badMod = validateEnum(body.modalidad, ['presencial', 'online', 'hibrido'], 'modalidad')
    if (badMod) return NextResponse.json({ error: badMod }, { status: 400 })

    // Discriminar flujo: nuevo (ownerId) vs legacy (accountId)
    if (body.ownerId) {
      // [TALLER ESTADO] Flujo nuevo: User tallerista directo
      if (!validateObjectId(body.ownerId)) {
        return NextResponse.json({ error: 'ownerId inválido' }, { status: 400 })
      }
      // El ownerId DEBE coincidir con la sesión (o ser admin)
      if (body.ownerId !== session.user.id && session.user.role !== 'admin') {
        return NextResponse.json({ error: 'No tienes permiso' }, { status: 403 })
      }
      // Verificar tallerista aprobado
      const taller = await TallerService.getById(body.ownerId)
      if (!taller || taller.taller?.estado !== 'aprobado') {
        return NextResponse.json({ error: 'Solo talleristas aprobados pueden publicar talleres' }, { status: 403 })
      }
      // Validar modeloAcceso
      const badAcceso = validateEnum(body.modeloAcceso, ['puntual', 'recurrente'], 'modeloAcceso')
      if (badAcceso) return NextResponse.json({ error: badAcceso }, { status: 400 })
    } else if (body.accountId) {
      // Flujo legacy basado en Account (deprecado)
      if (!validateObjectId(body.accountId)) {
        return NextResponse.json({ error: 'accountId inválido' }, { status: 400 })
      }
      if (!body.cupoMax) {
        return NextResponse.json({ error: 'cupoMax requerido en flujo legacy' }, { status: 400 })
      }
      const account = await AccountService.getById(body.accountId)
      if (!account) return NextResponse.json({ error: 'Espacio no encontrado' }, { status: 404 })
      if (account.ownerId.toString() !== session.user.id && session.user.role !== 'admin') {
        return NextResponse.json({ error: 'No tienes permiso' }, { status: 403 })
      }
    } else {
      return NextResponse.json({ error: 'Debe incluir ownerId o accountId' }, { status: 400 })
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
