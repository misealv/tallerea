import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SubscriptionService } from '@/services/SubscriptionService'
import { validateRequired, validateObjectId } from '@/lib/validate'
import { findOrCreateGuestUser } from '@/lib/guestUser'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const page = Number(searchParams.get('page')) || 1
    const limit = Number(searchParams.get('limit')) || 20
    const workshopId = searchParams.get('workshopId')

    const filters: Record<string, unknown> = {}
    // Alumno solo ve sus propias suscripciones
    if (session.user.role !== 'admin') {
      filters.studentId = session.user.id
    }
    if (workshopId) filters.workshopId = workshopId

    const result = await SubscriptionService.getAll(filters, page, limit)
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
    const missing = validateRequired(body, ['workshopId'])
    if (missing) return NextResponse.json({ error: missing }, { status: 400 })
    if (!validateObjectId(body.workshopId)) {
      return NextResponse.json({ error: 'workshopId inválido' }, { status: 400 })
    }

    // Resolver studentId + email: sesión activa O checkout invitado
    let studentId: string
    let studentEmail: string
    if (session?.user?.id && session.user.email) {
      studentId = session.user.id
      studentEmail = session.user.email
    } else {
      const name = typeof body.name === 'string' ? body.name : ''
      const email = typeof body.email === 'string' ? body.email : ''
      if (!name.trim() || !email.trim()) {
        return NextResponse.json(
          { error: 'Debes ingresar nombre y email para suscribirte' },
          { status: 400 }
        )
      }
      if (!EMAIL_RE.test(email.trim())) {
        return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
      }
      const guest = await findOrCreateGuestUser(name, email)
      studentId = guest.userId
      studentEmail = guest.email
    }

    const result = await SubscriptionService.createWithPayment(
      body.workshopId,
      studentId,
      studentEmail
    )

    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
