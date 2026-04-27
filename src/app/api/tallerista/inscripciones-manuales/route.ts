import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { InscripcionManualPuntualSchema, InscripcionManualRecurrenteSchema } from '@/schemas/inscripcionManual'
import { EnrollmentService } from '@/services/EnrollmentService'
import { SubscriptionService } from '@/services/SubscriptionService'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Solo talleristas aprobados o admin
  const role = session.user.role
  const tallerEstado = (session.user as { tallerEstado?: string }).tallerEstado
  if (role !== 'admin' && tallerEstado !== 'aprobado') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  // Discriminar por tipo para elegir schema
  const tipo = (body as Record<string, unknown>)?.tipo
  if (tipo !== 'puntual' && tipo !== 'recurrente') {
    return NextResponse.json({ error: '"tipo" debe ser "puntual" o "recurrente"' }, { status: 400 })
  }

  const schema = tipo === 'puntual' ? InscripcionManualPuntualSchema : InscripcionManualRecurrenteSchema
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validación fallida', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const ownerId = session.user.id
  const isAdmin = role === 'admin'

  try {
    if (parsed.data.tipo === 'puntual') {
      const d = parsed.data
      const enrollment = await EnrollmentService.createManual({
        ownerId,
        isAdmin,
        workshopId:              d.workshopId,
        studentEmail:            d.studentEmail,
        studentNombre:           d.studentNombre,
        dependentNombre:         d.dependentNombre,
        dependentFechaNacimiento: d.dependentFechaNacimiento,
        dependentNotas:          d.dependentNotas,
        slotIndex:               d.slotIndex,
        montoPagado:             d.montoPagado,
        notaTallerista:          d.notaTallerista,
      })
      // Revalidar p\u00e1ginas que muestran cupos / inscritos
      revalidatePath(`/tallerista/talleres/${d.workshopId}/inscritos`)
      revalidatePath('/talleres')
      return NextResponse.json({ tipo: 'puntual', enrollment }, { status: 201 })
    } else {
      const d = parsed.data
      const subscription = await SubscriptionService.createManual({
        ownerId,
        isAdmin,
        workshopId:         d.workshopId,
        studentEmail:       d.studentEmail,
        studentNombre:      d.studentNombre,
        dependentNombre:    d.dependentNombre,
        dependentFechaNacimiento: d.dependentFechaNacimiento,
        dependentNotas:     d.dependentNotas,
        precioEspecial:     d.precioEspecial,
        precioSnapshot:     d.precioSnapshot,
        notaPrecioEspecial: d.notaPrecioEspecial,
        clasesPrepagadas:   d.clasesPrepagadas,
        notaTallerista:     d.notaTallerista,
      })
      revalidatePath(`/tallerista/talleres/${d.workshopId}/inscritos`)
      return NextResponse.json({ tipo: 'recurrente', subscription }, { status: 201 })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    // Errores de negocio conocidos → 400
    const knownPrefixes = ['No tienes permiso', 'Taller no encontrado', 'Ya está inscrito', 'No hay cupo', 'createManual', '[FINANCE', '[PREPAGADO', 'precioSnapshot', 'Ya tiene una suscripción']
    const status = knownPrefixes.some(p => message.includes(p)) ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
