import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Workshop from '@/models/Workshop'
import Subscription from '@/models/Subscription'
import Enrollment from '@/models/Enrollment'
import User from '@/models/User'
import { sendWorkshopAnnouncement } from '@/lib/resend'
import { z } from 'zod'
import { Types } from 'mongoose'

const Schema = z.object({
  asunto:  z.string().trim().min(3).max(150),
  mensaje: z.string().trim().min(10).max(5000),
}).strict()

interface WorkshopLean { _id: Types.ObjectId; titulo: string; slug?: string; ownerId?: Types.ObjectId; accountId?: Types.ObjectId }
interface StudentRef { _id: Types.ObjectId; email?: string }

// POST /api/tallerista/talleres/[id]/anuncio
// Envía un anuncio del tallerista a todos los alumnos con sub activa o enrollment pagado del taller.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    await dbConnect()

    const workshop = await Workshop.findById(params.id)
      .select('titulo slug ownerId accountId')
      .lean<WorkshopLean>()
    if (!workshop) return NextResponse.json({ error: 'Taller no encontrado' }, { status: 404 })

    const ownerId = String(workshop.ownerId ?? workshop.accountId ?? '')
    if (session.user.role !== 'admin' && ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
    }

    // Tallerista
    const tallerista = await User.findById(session.user.id).select('name email').lean<{ name?: string; email?: string }>()
    const talleristaNombre = tallerista?.name || 'Tu tallerista'
    const talleristaEmail = tallerista?.email

    // Recolectar emails de subs activas + enrollments pagados (alumnos vigentes)
    const [subs, enrollments] = await Promise.all([
      Subscription.find({ workshopId: params.id, estado: 'activa', activo: true })
        .populate('studentId', 'email')
        .select('studentId')
        .lean<{ studentId: StudentRef }[]>(),
      Enrollment.find({ workshopId: params.id, estado: 'pagado', activo: true })
        .populate('studentId', 'email')
        .select('studentId')
        .lean<{ studentId: StudentRef }[]>(),
    ])

    const emails = [
      ...subs.map(s => s.studentId?.email).filter((e): e is string => !!e),
      ...enrollments.map(e => e.studentId?.email).filter((e): e is string => !!e),
    ]

    if (emails.length === 0) {
      return NextResponse.json({ error: 'No hay alumnos vigentes a quienes notificar' }, { status: 400 })
    }

    const result = await sendWorkshopAnnouncement({
      workshopTitle: workshop.titulo,
      workshopSlug:  workshop.slug,
      talleristaNombre,
      talleristaEmail,
      asunto:        parsed.data.asunto,
      mensaje:       parsed.data.mensaje,
      recipients:    emails,
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
