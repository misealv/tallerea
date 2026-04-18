import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { EnrollmentService } from '@/services/EnrollmentService'
import { validateObjectId } from '@/lib/validate'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    if (!validateObjectId(params.id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }
    const enrollment = await EnrollmentService.getById(params.id)
    if (!enrollment) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

    // Solo el alumno dueño o admin puede ver
    if (enrollment.studentId.toString() !== session.user.id && session.user.role !== 'admin') {
      return NextResponse.json({ error: 'No tienes permiso' }, { status: 403 })
    }

    return NextResponse.json(enrollment)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!validateObjectId(params.id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const enrollment = await EnrollmentService.getById(params.id)
  if (!enrollment) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  if (enrollment.studentId.toString() !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No tienes permiso' }, { status: 403 })
  }

  try {
    const body = await req.json()

    // Si pide cancelar, usar método especial con transacción
    if (body.estado === 'cancelado') {
      await EnrollmentService.cancel(params.id)
      return NextResponse.json({ success: true })
    }

    const updated = await EnrollmentService.update(params.id, body)
    return NextResponse.json(updated)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status = message.includes('no encontrad') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
