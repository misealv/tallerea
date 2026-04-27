import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import dbConnect from '@/lib/db'
import ManualPaymentRecord from '@/models/ManualPaymentRecord'
import { Types } from 'mongoose'

// DELETE /api/tallerista/manual-payments/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const role = session.user.role
  const estado = (session.user as { tallerEstado?: string }).tallerEstado
  if (role !== 'admin' && estado !== 'aprobado') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  try {
    await dbConnect()

    // Multi-tenant: solo el ownerId puede borrar su propio registro
    const record = await ManualPaymentRecord.findOne({
      _id: params.id,
      ownerId: new Types.ObjectId(session.user.id),
    }).lean()
    if (!record) return NextResponse.json({ error: 'No encontrado o no autorizado' }, { status: 404 })

    await ManualPaymentRecord.findByIdAndDelete(params.id)

    revalidatePath('/tallerista/finanzas')
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
