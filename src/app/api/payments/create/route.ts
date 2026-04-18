import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { PaymentService } from '@/services/PaymentService'

// POST /api/payments/create — crea inscripción + preferencia MercadoPago
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const { workshopId } = await req.json()
    if (!workshopId) return NextResponse.json({ error: 'workshopId es requerido' }, { status: 400 })

    const result = await PaymentService.createEnrollmentWithPayment(
      workshopId,
      session.user.id,
      session.user.name || '',
      session.user.email || '',
    )

    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status = message.includes('Ya estás inscrito') ? 409
      : message.includes('No hay cupos') ? 409
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}
