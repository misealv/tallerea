import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { AccountService } from '@/services/AccountService'
import { validateRequired, validateEnum } from '@/lib/validate'
import { generateSlug, ensureUniqueSlug } from '@/lib/slugify'
import Account from '@/models/Account'
import dbConnect from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await req.json()

    const missing = validateRequired(body, ['nombre', 'tipo'])
    if (missing) return NextResponse.json({ error: missing }, { status: 400 })

    const badEnum = validateEnum(body.tipo, ['individual', 'institucion'], 'tipo')
    if (badEnum) return NextResponse.json({ error: badEnum }, { status: 400 })

    // Verificar que el usuario no tenga ya un espacio
    const existing = await AccountService.getByOwnerId(session.user.id)
    if (existing) return NextResponse.json({ error: 'Ya tienes un espacio creado' }, { status: 400 })

    await dbConnect()
    const baseSlug = generateSlug(body.nombre)
    const slug = await ensureUniqueSlug(baseSlug, Account)

    const account = await AccountService.create({ ...body, slug }, session.user.id)
    return NextResponse.json(account, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
