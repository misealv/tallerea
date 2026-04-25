import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { PaymentService } from '@/services/PaymentService'
import { SubscriptionService } from '@/services/SubscriptionService'
import { WorkshopService } from '@/services/WorkshopService'
import { findOrCreateGuestUser } from '@/lib/guestUser'
import { rateLimit, getClientIp } from '@/lib/rateLimit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const dynamic = 'force-dynamic'

// POST /api/payments/create — crea inscripción + preferencia MercadoPago
// Acepta sesión activa O checkout invitado (name + email) → User pre-pago
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  // Rate-limit anti-bot: 10 intentos por IP por minuto (sin sesión sólo)
  if (!session?.user?.id) {
    const ip = getClientIp(req)
    const limited = rateLimit({ key: `pay:${ip}`, limit: 10, windowMs: 60 * 1000 })
    if (!limited.ok) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Espera un minuto.' },
        { status: 429 }
      )
    }
  }

  try {
    const body = await req.json()
    const { workshopId, slotIndex } = body
    if (!workshopId) return NextResponse.json({ error: 'workshopId es requerido' }, { status: 400 })

    // [RUTEO] Talleres recurrentes usan flujo de Subscription, no Enrollment
    const workshop = await WorkshopService.getById(workshopId)
    if (!workshop) return NextResponse.json({ error: 'Taller no encontrado' }, { status: 404 })

    if (workshop.modeloAcceso === 'recurrente') {
      let recurrenteStudentId: string
      let recurrenteStudentEmail: string

      if (session?.user?.id && session.user.email) {
        recurrenteStudentId = session.user.id
        recurrenteStudentEmail = session.user.email
      } else {
        const gName = typeof body.name === 'string' ? body.name.trim() : ''
        const gEmail = typeof body.email === 'string' ? body.email.trim() : ''
        if (!gName || !gEmail) {
          return NextResponse.json(
            { error: 'Ingresa tu nombre y email para continuar' },
            { status: 400 }
          )
        }
        if (!EMAIL_RE.test(gEmail)) {
          return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
        }
        const guest = await findOrCreateGuestUser(gName, gEmail)
        recurrenteStudentId = guest.userId
        recurrenteStudentEmail = guest.email
      }

      const subResult = await SubscriptionService.createWithPayment(
        workshopId,
        recurrenteStudentId,
        recurrenteStudentEmail
      )
      if (subResult.free) {
        return NextResponse.json({
          free: true,
          subscriptionId: String(subResult.subscription._id),
        })
      }
      return NextResponse.json({
        initPoint: subResult.initPoint,
        subscriptionId: String(subResult.subscription._id),
      })
    }

    // usarCredito: solo permitido para usuarios autenticados (guests no tienen saldo)
    const usarCredito = Boolean(body.usarCredito) && !!session?.user?.id
    const esClasePrueba = Boolean(body.esClasePrueba)
    const montoVoluntario = typeof body.montoVoluntario === 'number' ? body.montoVoluntario : undefined

    let studentId: string
    let studentName: string
    let studentEmail: string

    if (session?.user?.id && session.user.email) {
      studentId = session.user.id
      studentName = session.user.name || ''
      studentEmail = session.user.email
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
      studentName = guest.name
      studentEmail = guest.email
    }

    const result = await PaymentService.createEnrollmentWithPayment(
      workshopId,
      studentId,
      studentName,
      studentEmail,
      slotIndex ?? null,
      usarCredito,
      montoVoluntario,
      esClasePrueba,
    )

    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status = message.includes('Ya estás inscrito') ? 409
      : message.includes('No hay cupos') ? 409
      : message.includes('Ya usaste tu clase de prueba') ? 409
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}
