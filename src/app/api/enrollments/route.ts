import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { EnrollmentService } from '@/services/EnrollmentService'
import { WorkshopService } from '@/services/WorkshopService'
import { validateRequired, validateObjectId } from '@/lib/validate'
import { findOrCreateGuestUser } from '@/lib/guestUser'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
      // Verificar ownership: solo el dueño del taller o admin puede ver inscripciones
      if (session.user.role !== 'admin') {
        const workshop = await WorkshopService.getById(workshopId)
        if (!workshop) return NextResponse.json({ error: 'Taller no encontrado' }, { status: 404 })
        const ownerIdStr = workshop.ownerId ? String(workshop.ownerId) : null
        if (!ownerIdStr || ownerIdStr !== session.user.id) {
          return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
        }
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

  try {
    const body = await req.json()

    const missing = validateRequired(body, ['workshopId', 'monto'])
    if (missing) return NextResponse.json({ error: missing }, { status: 400 })

    if (!validateObjectId(body.workshopId)) {
      return NextResponse.json({ error: 'workshopId inválido' }, { status: 400 })
    }

    // Resolver studentId: sesión activa O checkout invitado (name + email)
    let studentId: string
    if (session?.user?.id) {
      studentId = session.user.id
    } else {
      const name = typeof body.name === 'string' ? body.name : ''
      const email = typeof body.email === 'string' ? body.email : ''
      if (!name.trim() || !email.trim()) {
        return NextResponse.json(
          { error: 'Debes ingresar nombre y email para inscribirte' },
          { status: 400 }
        )
      }
      if (!EMAIL_RE.test(email.trim())) {
        return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
      }
      const guest = await findOrCreateGuestUser(name, email)
      studentId = guest.userId
    }

    const enrollment = await EnrollmentService.create({
      workshopId: body.workshopId,
      studentId,
      monto: body.monto,
      slotIndex: body.slotIndex ?? null,
    })
    return NextResponse.json(enrollment, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status = message.includes('cupos') || message.includes('inscrito') ? 409 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
