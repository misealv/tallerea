import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Review from '@/models/Review'

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  await dbConnect()

  const review = await Review.findOne({ _id: params.id, activo: true })
  if (!review) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Toggle publicado
  review.publicado = !review.publicado
  await review.save()

  return NextResponse.json({ publicado: review.publicado })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  await dbConnect()
  await Review.findByIdAndUpdate(params.id, { activo: false })

  return NextResponse.json({ success: true })
}
