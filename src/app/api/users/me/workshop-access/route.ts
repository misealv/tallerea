import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Enrollment from '@/models/Enrollment'
import Subscription from '@/models/Subscription'
import { validateObjectId } from '@/lib/validate'

export const dynamic = 'force-dynamic'

/**
 * GET /api/users/me/workshop-access?workshopId=...
 *
 * Devuelve si el alumno autenticado ya tiene una inscripción pagada o
 * suscripción activa para el taller indicado. Se usa en la página de detalle
 * del taller para ocultar el botón de "Inscribirse" / "Suscribirme" y mostrar
 * un acceso directo a "Mis talleres" cuando ya compró.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ enrolled: false, subscribed: false })
  }

  const { searchParams } = new URL(req.url)
  const workshopId = searchParams.get('workshopId')
  if (!workshopId || !validateObjectId(workshopId)) {
    return NextResponse.json({ error: 'workshopId inválido' }, { status: 400 })
  }

  try {
    await dbConnect()
    const studentId = session.user.id

    // Inscripción puntual pagada (excluye clase de prueba — esa no bloquea)
    const enrollmentDoc = await Enrollment.findOne({
      studentId,
      workshopId,
      estado: 'pagado',
      esClasePrueba: { $ne: true },
      activo: true,
    }).select('_id esClasePrueba').lean<{ _id: unknown }>()

    // Suscripción recurrente activa y vigente
    const subscriptionDoc = await Subscription.findOne({
      studentId,
      workshopId,
      estado: 'activa',
      activo: true,
      fechaVencimiento: { $gte: new Date() },
    }).select('_id').lean<{ _id: unknown }>()

    return NextResponse.json({
      enrolled:   !!enrollmentDoc,
      subscribed: !!subscriptionDoc,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
