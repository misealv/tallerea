import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { InscripcionManualPuntualSchema, InscripcionManualRecurrenteSchema } from '@/schemas/inscripcionManual'
import { EnrollmentService } from '@/services/EnrollmentService'
import { SubscriptionService } from '@/services/SubscriptionService'

export const dynamic = 'force-dynamic'

const knownPrefixes = ['No tienes permiso', 'Taller no encontrado', 'Ya está inscrito', 'No hay cupo', 'createManual', '[FINANCE', '[PREPAGADO', 'precioSnapshot', 'Ya tiene una suscripción']
function isBusinessError(msg: string) { return knownPrefixes.some(p => msg.includes(p)) }

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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
        workshopId:               d.workshopId,
        studentEmail:             d.studentEmail,
        studentNombre:            d.studentNombre,
        dependentNombre:          d.dependentNombre,
        dependentFechaNacimiento: d.dependentFechaNacimiento,
        dependentNotas:           d.dependentNotas,
        slotIndex:                d.slotIndex,
        montoPagado:              d.montoPagado,
        notaTallerista:           d.notaTallerista,
      })
      revalidatePath(`/tallerista/talleres/${d.workshopId}/inscritos`)
      revalidatePath('/talleres')
      return NextResponse.json({ tipo: 'puntual', enrollment }, { status: 201 })
    }

    // --- Recurrente ---
    const d = parsed.data

    // Modo B: inscripción múltiple con array de dependientes
    if (d.dependientes && d.dependientes.length > 0) {
      const resultados: Array<{ nombre: string; ok: boolean; error?: string }> = []

      for (const dep of d.dependientes) {
        try {
          await SubscriptionService.createManual({
            ownerId,
            isAdmin,
            workshopId:               d.workshopId,
            studentEmail:             d.studentEmail,
            studentNombre:            d.studentNombre,
            dependentNombre:          dep.nombre,
            dependentFechaNacimiento: dep.fechaNacimiento,
            dependentNotas:           dep.notas,
            precioEspecial:           dep.precioEspecial,
            precioSnapshot:           dep.precioSnapshot,
            notaPrecioEspecial:       dep.notaPrecioEspecial,
            clasesPrepagadas:         dep.clasesPrepagadas,
            notaTallerista:           d.notaTallerista,
          })
          resultados.push({ nombre: dep.nombre, ok: true })
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Error desconocido'
          resultados.push({ nombre: dep.nombre, ok: false, error: msg })
        }
      }

      revalidatePath(`/tallerista/talleres/${d.workshopId}/inscritos`)
      revalidatePath('/talleres')

      const fallidos = resultados.filter(r => !r.ok)
      if (fallidos.length === resultados.length) {
        // Todos fallaron → 400
        return NextResponse.json({ tipo: 'recurrente', resultados, error: 'Ningún dependiente pudo inscribirse' }, { status: 400 })
      }
      // Al menos uno exitoso → 207 Multi-Status
      const status = fallidos.length > 0 ? 207 : 201
      return NextResponse.json({ tipo: 'recurrente', resultados }, { status })
    }

    // Modo A: inscripción individual (compatibilidad hacia atrás)
    const subscription = await SubscriptionService.createManual({
      ownerId,
      isAdmin,
      workshopId:               d.workshopId,
      studentEmail:             d.studentEmail,
      studentNombre:            d.studentNombre,
      dependentNombre:          d.dependentNombre,
      dependentFechaNacimiento: d.dependentFechaNacimiento,
      dependentNotas:           d.dependentNotas,
      precioEspecial:           d.precioEspecial ?? false,
      precioSnapshot:           d.precioSnapshot,
      notaPrecioEspecial:       d.notaPrecioEspecial,
      clasesPrepagadas:         d.clasesPrepagadas,
      notaTallerista:           d.notaTallerista,
    })
    revalidatePath(`/tallerista/talleres/${d.workshopId}/inscritos`)
    revalidatePath('/talleres')
    return NextResponse.json({ tipo: 'recurrente', subscription }, { status: 201 })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    const status = isBusinessError(message) ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

