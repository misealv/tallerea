import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import User from '@/models/User'

// GET /api/tallerista/inscripciones-manuales/lookup-alumno?email=xxx
// Devuelve nombre + dependientes activos de un alumno existente, para pre-llenar el form de inscripción manual.
// SOLO para talleristas aprobados o admin (privacidad — no exponer dependientes a usuarios cualquiera).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const role = session.user.role
  const tallerEstado = (session.user as { tallerEstado?: string | null }).tallerEstado
  if (role !== 'admin' && tallerEstado !== 'aprobado') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  await dbConnect()

  const user = await User.findOne({ email, activo: true })
    .select('name dependents')
    .lean<{ name: string; dependents?: { _id: unknown; nombre: string; activo?: boolean }[] }>()

  if (!user) return NextResponse.json({ found: false })

  return NextResponse.json({
    found: true,
    nombre: user.name,
    dependents: (user.dependents ?? [])
      .filter(d => d.activo !== false)
      .map(d => ({ _id: String(d._id), nombre: d.nombre })),
  })
}
