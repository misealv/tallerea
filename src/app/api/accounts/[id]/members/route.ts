import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { AccountService } from '@/services/AccountService'
import AccountMember, { IAccountMember } from '@/models/AccountMember'
import User from '@/models/User'
import dbConnect from '@/lib/db'
import { validateObjectId } from '@/lib/validate'

// GET /api/accounts/[id]/members — listar miembros del espacio
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!validateObjectId(params.id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  // Verificar ownership
  const account = await AccountService.getById(params.id)
  if (!account) return NextResponse.json({ error: 'Espacio no encontrado' }, { status: 404 })
  if (account.ownerId.toString() !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No tienes permiso' }, { status: 403 })
  }

  await dbConnect()
  const members = await AccountMember.find({ accountId: params.id, activo: true })
    .populate('userId', 'name email')
    .lean<IAccountMember[]>()

  return NextResponse.json(members)
}

// POST /api/accounts/[id]/members — invitar miembro
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!validateObjectId(params.id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const account = await AccountService.getById(params.id)
  if (!account) return NextResponse.json({ error: 'Espacio no encontrado' }, { status: 404 })
  if (account.ownerId.toString() !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No tienes permiso' }, { status: 403 })
  }

  try {
    const { email, nombre, rol } = await req.json()
    if (!email || !nombre) {
      return NextResponse.json({ error: 'Email y nombre son requeridos' }, { status: 400 })
    }

    await dbConnect()

    // Buscar usuario por email
    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) {
      return NextResponse.json({ error: 'No existe un usuario con ese email. Debe registrarse primero.' }, { status: 404 })
    }

    // Verificar que no sea miembro ya
    const existing = await AccountMember.findOne({ accountId: params.id, userId: user._id, activo: true })
    if (existing) {
      return NextResponse.json({ error: 'Ya es miembro de este espacio' }, { status: 409 })
    }

    const member = new AccountMember({
      accountId: params.id,
      userId: user._id,
      rol: rol || 'instructor',
      nombre,
      aceptado: true,
    })
    await member.save()

    return NextResponse.json(member, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
