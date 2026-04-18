import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import User from '@/models/User'

// GET /api/admin/users — listar todos los usuarios
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  await dbConnect()
  const users = await User.find()
    .select('-password')
    .sort({ createdAt: -1 })
    .lean()

  return NextResponse.json(users)
}
