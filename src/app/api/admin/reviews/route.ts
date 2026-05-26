import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Review from '@/models/Review'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  await dbConnect()

  const reviews = await Review.find({ activo: true })
    .sort({ createdAt: -1 })
    .populate('studentId', 'name email')
    .populate('workshopId', 'titulo slug')
    .lean()

  return NextResponse.json(reviews)
}
