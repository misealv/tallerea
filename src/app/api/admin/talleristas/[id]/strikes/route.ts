import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Booking from '@/models/Booking'
import Subscription from '@/models/Subscription'
import Workshop from '@/models/Workshop'
import { validateObjectId } from '@/lib/validate'

export const dynamic = 'force-dynamic'

// GET /api/admin/talleristas/[id]/strikes
// Devuelve estadísticas de no-shows del tallerista basadas en Bookings
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  if (!validateObjectId(params.id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  await dbConnect()

  // Buscar workshops del tallerista (ownerId)
  const workshops = await Workshop.find({ ownerId: params.id, activo: true }).select('_id titulo').lean()
  const workshopIds = workshops.map(w => w._id)

  if (workshopIds.length === 0) {
    return NextResponse.json({ noShows: 0, total: 0, pct: 0, workshops: [] })
  }

  // Buscar subscriptions de esos workshops para obtener bookingIds
  const subscriptions = await Subscription.find({ workshopId: { $in: workshopIds } }).select('_id').lean()
  const subscriptionIds = subscriptions.map(s => s._id)

  const [noShows, total] = await Promise.all([
    Booking.countDocuments({ subscriptionId: { $in: subscriptionIds }, estado: 'no_asistio' }),
    Booking.countDocuments({ subscriptionId: { $in: subscriptionIds }, estado: { $ne: 'cancelada' } }),
  ])

  // Detalle por taller
  const workshopStats = await Promise.all(
    workshops.map(async w => {
      const subs = await Subscription.find({ workshopId: w._id }).select('_id').lean()
      const subIds = subs.map(s => s._id)
      const [ws_noShows, ws_total] = await Promise.all([
        Booking.countDocuments({ subscriptionId: { $in: subIds }, estado: 'no_asistio' }),
        Booking.countDocuments({ subscriptionId: { $in: subIds }, estado: { $ne: 'cancelada' } }),
      ])
      return { workshopId: w._id, titulo: (w as { titulo?: string }).titulo, noShows: ws_noShows, total: ws_total }
    })
  )

  return NextResponse.json({
    noShows,
    total,
    pct: total > 0 ? Math.round((noShows / total) * 100) : 0,
    workshops: workshopStats,
  })
}
