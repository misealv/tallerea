import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Enrollment from '@/models/Enrollment'

export const dynamic = 'force-dynamic'

// GET /api/enrollments/pruebas-activas?workshopId=X
// Devuelve las clases de prueba activas (pendiente o pagada) del usuario actual en el taller.
// Usado para mostrar aviso en /inscribirse cuando ya existe una prueba reservada.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ pruebas: [] })

  const { searchParams } = new URL(req.url)
  const workshopId = searchParams.get('workshopId')
  if (!workshopId) return NextResponse.json({ pruebas: [] })

  await dbConnect()

  const enrollments = await Enrollment.find({
    workshopId,
    studentId: session.user.id,
    esClasePrueba: true,
    estado:    { $ne: 'cancelado' },
    activo:    true,
  })
    .select('dependentNombreSnapshot')
    .lean<{ dependentNombreSnapshot?: string }[]>()

  const pruebas = enrollments.map(e => ({
    nombre: e.dependentNombreSnapshot ?? 'yo mismo/a',
  }))

  return NextResponse.json({ pruebas })
}
