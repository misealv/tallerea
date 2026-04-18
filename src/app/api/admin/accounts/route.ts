import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Account from '@/models/Account'

export const dynamic = 'force-dynamic'

// GET /api/admin/accounts — listar todos los espacios
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  await dbConnect()
  const accounts = await Account.find({ activo: true })
    .populate('ownerId', 'name email')
    .sort({ createdAt: -1 })
    .lean()

  return NextResponse.json(accounts)
}

// PUT /api/admin/accounts — verificar/rechazar espacio
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    const { accountId, verificado } = await req.json()
    if (!accountId) return NextResponse.json({ error: 'accountId requerido' }, { status: 400 })

    await dbConnect()
    const account = await Account.findByIdAndUpdate(
      accountId,
      { verificado: Boolean(verificado) },
      { new: true }
    )
    if (!account) return NextResponse.json({ error: 'Espacio no encontrado' }, { status: 404 })

    return NextResponse.json(account)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
