import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Types } from 'mongoose'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Subscription from '@/models/Subscription'
import Workshop from '@/models/Workshop'
import RecargarPaqueteButton from '@/components/RecargarPaqueteButton'

export const dynamic = 'force-dynamic'

interface PaqueteLean {
  _id: Types.ObjectId
  nombre: string
  precio: number
  sesionesIncluidas: number
  duracionDias: number
  activo: boolean
  destacado?: boolean
}

interface WorkshopLean {
  _id: Types.ObjectId
  titulo: string
  slug: string
  paquetes?: PaqueteLean[]
}

interface SubLean {
  _id: Types.ObjectId
  studentId: Types.ObjectId
  workshopId: Types.ObjectId
  estado: string
  sesionesDisponibles: number
  fechaVencimiento: Date
}

export default async function RecargarPage({
  params,
}: {
  params: { workshopId: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect(`/login?callbackUrl=/alumno/mis-talleres/${params.workshopId}/recargar`)

  await dbConnect()

  // Buscar suscripción activa del alumno en este taller
  const sub = await Subscription.findOne({
    workshopId: params.workshopId,
    studentId: session.user.id,
    estado: 'activa',
  }).lean<SubLean | null>()

  if (!sub) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <h1 className="text-2xl font-bold mb-4">Recargar paquete</h1>
        <p className="text-gray-700 mb-6">
          No tienes una suscripción activa en este taller.
        </p>
        <Link
          href="/alumno/mis-talleres"
          className="text-purple-600 hover:underline"
        >
          ← Volver a mis talleres
        </Link>
      </div>
    )
  }

  const workshop = await Workshop.findById(params.workshopId)
    .select('titulo slug paquetes')
    .lean<WorkshopLean | null>()

  if (!workshop) redirect('/alumno/mis-talleres')

  const paquetesActivos = (workshop.paquetes ?? []).filter(p => p.activo && p.precio > 0)

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <Link
        href="/alumno/mis-talleres"
        className="text-sm text-purple-600 hover:underline mb-4 inline-block"
      >
        ← Volver a mis talleres
      </Link>

      <h1 className="text-3xl font-bold mb-2">Recargar paquete</h1>
      <p className="text-gray-600 mb-2">{workshop.titulo}</p>
      <p className="text-sm text-gray-500 mb-8">
        Saldo actual: <strong>{sub.sesionesDisponibles}</strong> clases disponibles.
        Al recargar, las nuevas clases se suman a tu saldo y extienden tu vencimiento.
      </p>

      {paquetesActivos.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <p className="text-amber-900">
            Este taller no tiene paquetes disponibles para recarga en este momento.
            Contacta a tu tallerista.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {paquetesActivos.map(paquete => (
            <div
              key={String(paquete._id)}
              className={`border rounded-xl p-6 bg-white shadow-sm flex flex-col ${
                paquete.destacado ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-200'
              }`}
            >
              {paquete.destacado && (
                <span className="inline-block self-start text-xs font-semibold bg-purple-100 text-purple-700 px-2 py-1 rounded mb-3">
                  Recomendado
                </span>
              )}
              <h3 className="text-xl font-bold mb-2">{paquete.nombre}</h3>
              <ul className="text-sm text-gray-600 space-y-1 mb-6 flex-1">
                <li>· {paquete.sesionesIncluidas} clases</li>
                <li>· Vigencia: {paquete.duracionDias} días</li>
                <li>
                  · Costo por clase: $
                  {Math.round(paquete.precio / paquete.sesionesIncluidas).toLocaleString('es-CL')}
                </li>
              </ul>
              <RecargarPaqueteButton
                subscriptionId={String(sub._id)}
                paquete={{
                  _id: String(paquete._id),
                  nombre: paquete.nombre,
                  precio: paquete.precio,
                  sesionesIncluidas: paquete.sesionesIncluidas,
                  duracionDias: paquete.duracionDias,
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
