import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import User from '@/models/User'

// GET /api/tallerista/inscripciones-manuales/lookup-alumno?email=xxx
// Devuelve nombre + dependientes activos de un alumno existente, para pre-llenar el form de inscripción manual
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'admin' && session.user.role !== 'user')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 })

  await dbConnect()

  const user = await User.findOne({ email, activo: true })
    .select('name dependents')
    .lean<{ name: string; dependents: { _id: unknown; nombre: string; activo: boolean }[] }>()

  if (!user) return NextResponse.json({ found: false })

  return NextResponse.json({
    found: true,
    nombre: user.name,
    dependents: (user.dependents ?? [])
      .filter(d => d.activo !== false)
      .map(d => ({ _id: String(d._id), nombre: d.nombre })),
  })
}
