import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { EnrollmentService } from '@/services/EnrollmentService'
import { validateRequired, validateObjectId } from '@/lib/validate'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const page = Number(searchParams.get('page')) || 1
    const limit = Number(searchParams.get('limit')) || 20
    const workshopId = searchParams.get('workshopId')

    if (workshopId) {
      if (!validateObjectId(workshopId)) {
        return NextResponse.json({ error: 'workshopId inválido' }, { status: 400 })
      }
      const result = await EnrollmentService.getByWorkshopId(workshopId, page, limit)
      return NextResponse.json(result)
    }

    // Por defecto: inscripciones del alumno logueado
    const result = await EnrollmentService.getByStudentId(session.user.id, page, limit)
    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await req.json()

    const missing = validateRequired(body, ['workshopId', 'monto'])
    if (missing) return NextResponse.json({ error: missing }, { status: 400 })

    if (!validateObjectId(body.workshopId)) {
      return NextResponse.json({ error: 'workshopId inválido' }, { status: 400 })
    }

    const enrollment = await EnrollmentService.create({
      workshopId: body.workshopId,
      studentId: session.user.id,
      monto: body.monto,
    })
    return NextResponse.json(enrollment, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status = message.includes('cupos') || message.includes('inscrito') ? 409 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
