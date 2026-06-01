import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import dbConnect from '@/lib/db'
import Workshop from '@/models/Workshop'
import Enrollment from '@/models/Enrollment'
import Subscription from '@/models/Subscription'
import { Types } from 'mongoose'
import EliminarTallerBtn from '@/components/EliminarTallerBtn'
import DuplicarTallerBtn from '@/components/DuplicarTallerBtn'
import { getCloudinaryUrl, TRANSFORM } from '@/lib/cloudinary-transform'

export const dynamic = 'force-dynamic'

interface WorkshopLean {
  _id: Types.ObjectId
  titulo: string
  slug: string
  tipo: string
  modalidad: string
  modeloAcceso?: 'puntual' | 'recurrente'
  plan?: unknown
  activo: boolean
  imagenes?: string[]
  fechaInicio?: Date
}

export default async function MisTalleresPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')
  if (session.user.tallerEstado !== 'aprobado') redirect('/tallerista/onboarding')

  await dbConnect()
  const ownerId = session.user.id

  const workshops = await Workshop.find({
    $or: [{ ownerId }, { accountId: ownerId }],
    deletedAt: null,
  })
    .select('titulo slug tipo modalidad modeloAcceso plan activo imagenes fechaInicio')
    .sort({ createdAt: -1 })
    .lean<WorkshopLean[]>()

  const workshopIds = workshops.map(w => w._id)

  // Contar inscritos por taller en una sola query cada uno (simple, permite grids pequeños)
  const [enrollCounts, enrollPendingCounts, subCounts, subPendingCounts] = await Promise.all([
    Enrollment.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { workshopId: { $in: workshopIds }, estado: 'pagado', activo: true } },
      { $group: { _id: '$workshopId', count: { $sum: 1 } } },
    ]),
    Enrollment.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { workshopId: { $in: workshopIds }, estado: 'pendiente', activo: true } },
      { $group: { _id: '$workshopId', count: { $sum: 1 } } },
    ]),
    Subscription.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { workshopId: { $in: workshopIds }, estado: 'activa', activo: true } },
      { $group: { _id: '$workshopId', count: { $sum: 1 } } },
    ]),
    Subscription.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { workshopId: { $in: workshopIds }, estado: 'pendiente_pago', activo: true } },
      { $group: { _id: '$workshopId', count: { $sum: 1 } } },
    ]),
  ])

  const enrollMap = new Map(enrollCounts.map(x => [String(x._id), x.count]))
  const enrollPendMap = new Map(enrollPendingCounts.map(x => [String(x._id), x.count]))
  const subMap = new Map(subCounts.map(x => [String(x._id), x.count]))
  const subPendMap = new Map(subPendingCounts.map(x => [String(x._id), x.count]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis talleres</h1>
          <p className="text-sm text-gray-500 mt-1">
            {workshops.length === 0 ? 'Aún no has publicado talleres.' : `${workshops.length} taller${workshops.length !== 1 ? 'es' : ''}`}
          </p>
        </div>
        <Link
          href="/tallerista/talleres/nuevo"
          className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg"
        >
          + Nuevo taller
        </Link>
      </div>

      {workshops.length === 0 ? (
        <div className="bg-gray-50 rounded-xl px-6 py-10 text-center">
          <p className="text-sm text-gray-500 mb-4">Crea tu primer taller para empezar a recibir inscripciones.</p>
          <Link
            href="/tallerista/talleres/nuevo"
            className="inline-block bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg"
          >
            Publicar taller
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workshops.map(w => {
            const esRecurrente = w.modeloAcceso === 'recurrente' || Boolean(w.plan)
            const inscritos = enrollMap.get(String(w._id)) ?? 0
            const inscritosPend = enrollPendMap.get(String(w._id)) ?? 0
            const suscriptores = subMap.get(String(w._id)) ?? 0
            const suscriptoresPend = subPendMap.get(String(w._id)) ?? 0
            return (
              <div
                key={String(w._id)}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-purple-300 transition-colors"
              >
                {w.imagenes && w.imagenes[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={getCloudinaryUrl(w.imagenes[0], TRANSFORM.card) ?? w.imagenes[0]} alt={w.titulo} className="w-full h-32 object-cover" />
                )}
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight">{w.titulo}</h3>
                    {!w.activo && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactivo</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{w.tipo}</span>
                    <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{w.modalidad}</span>
                    <span className="bg-gray-50 text-gray-600 px-2 py-0.5 rounded-full">
                      {esRecurrente ? 'Recurrente' : 'Puntual'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {esRecurrente
                      ? `${suscriptores} suscriptor${suscriptores !== 1 ? 'es' : ''} activo${suscriptores !== 1 ? 's' : ''}`
                      : `${inscritos} inscripción${inscritos !== 1 ? 'es' : ''} pagada${inscritos !== 1 ? 's' : ''}`}
                    {(esRecurrente ? suscriptoresPend : inscritosPend) > 0 && (
                      <span className="ml-2 text-amber-600">
                        · {esRecurrente ? suscriptoresPend : inscritosPend} pendiente{(esRecurrente ? suscriptoresPend : inscritosPend) !== 1 ? 's' : ''} de pago
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 mt-3">
                    <Link
                      href={`/tallerista/talleres/${String(w._id)}/editar`}
                      className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                    >
                      Editar
                    </Link>
                    <span className="text-gray-300">·</span>
                    <Link
                      href={`/tallerista/talleres/${String(w._id)}/inscritos`}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Inscritos
                    </Link>
                    <span className="text-gray-300">·</span>
                    <Link
                      href={`/tallerista/talleres/${String(w._id)}/materiales`}
                      className="text-xs text-orange-600 hover:text-orange-800 font-medium"
                    >
                      Materiales
                    </Link>
                    <span className="text-gray-300">·</span>
                    <Link
                      href={`/tallerista/talleres/${String(w._id)}/inscribir`}
                      className="text-xs text-green-600 hover:text-green-800 font-medium"
                    >
                      + Inscribir alumno
                    </Link>
                    <span className="text-gray-300">·</span>
                    <Link
                      href={`/talleres/${w.slug}`}
                      className="text-xs text-gray-500 hover:text-gray-700"
                      target="_blank"
                    >
                      Ver ↗
                    </Link>
                    <span className="text-gray-300">·</span>
                    <EliminarTallerBtn id={String(w._id)} titulo={w.titulo} />
                    <span className="text-gray-300">·</span>
                    <DuplicarTallerBtn id={String(w._id)} titulo={w.titulo} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
