import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import dbConnect from '@/lib/db'
import Enrollment from '@/models/Enrollment'
import Workshop from '@/models/Workshop'
import { Types } from 'mongoose'

// DELETE /api/tallerista/enrollments/[id]
// Cancela (soft-delete) una inscripción puntual. Solo el dueño del taller puede hacerlo.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  try {
    await dbConnect()

    const enrollment = await Enrollment.findById(params.id).lean<{ workshopId: Types.ObjectId }>()
    if (!enrollment) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    // Multi-tenant: verificar que el taller pertenece al tallerista
    const workshop = await Workshop.findOne({
      _id: enrollment.workshopId,
      ownerId: session.user.id,
    }).select('_id').lean()
    if (!workshop) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await Enrollment.findByIdAndUpdate(params.id, {
      activo: false,
      estado: 'cancelado',
    })

    revalidatePath(`/tallerista/talleres`)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
