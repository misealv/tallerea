import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { EnrollmentService } from '@/services/EnrollmentService'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import Link from 'next/link'
import CancelButton from './CancelButton'
import dbConnect from '@/lib/db'
import Workshop from '@/models/Workshop'
import Location from '@/models/Location'
import User from '@/models/User'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Mis talleres — Tallerea',
}

const estadoBadge: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  pagado: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-600',
}

interface SlotInfo { dia?: string; horaInicio: string; horaFin: string; fecha?: Date }
interface ClasePruebaDetail {
  enrollmentId: string
  workshopSlug: string
  horaInicio: string
  horaFin: string
  fechaSlot: string | null
  diaSemana: string | null
  profesorNombre: string
  direccion: string | null
}

const DIAS_LABEL: Record<string, string> = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
  viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
}

export default async function MisTalleresPage({
  searchParams,
}: {
  searchParams: Promise<{ pago?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/mis-talleres')

  const params = await searchParams
  await dbConnect()
  const result = await EnrollmentService.getByStudentId(session.user.id, 1, 50)

  // Resolver detalles para clases de prueba pagadas
  const pruebaMap = new Map<string, ClasePruebaDetail>()
  const pruebasPayadas = result.data.filter(
    e => (e as unknown as { esClasePrueba?: boolean }).esClasePrueba && e.estado === 'pagado'
  )
  for (const e of pruebasPayadas) {
    const w = e.workshopId as unknown as { slug: string } | null
    if (!w?.slug) continue
    const wDoc = await Workshop.findOne({ slug: w.slug })
      .select('ownerId locationId slots')
      .lean<{ ownerId: Types.ObjectId; locationId?: Types.ObjectId; slots: SlotInfo[] }>()
    if (!wDoc) continue
    const slot: SlotInfo | undefined =
      (e as unknown as { slotIndex?: number | null }).slotIndex != null
        ? wDoc.slots[(e as unknown as { slotIndex: number }).slotIndex]
        : undefined
    const [owner, loc] = await Promise.all([
      User.findById(wDoc.ownerId).select('name').lean<{ name: string }>(),
      wDoc.locationId
        ? Location.findById(wDoc.locationId).select('nombre direccion comuna ciudad').lean<{ nombre: string; direccion: string; comuna: string; ciudad: string }>()
        : null,
    ])
    pruebaMap.set(String(e._id), {
      enrollmentId: String(e._id),
      workshopSlug: w.slug,
      horaInicio: slot?.horaInicio ?? '',
      horaFin: slot?.horaFin ?? '',
      fechaSlot: slot?.fecha ? new Date(slot.fecha).toISOString().slice(0, 10) : null,
      diaSemana: slot?.dia ? (DIAS_LABEL[slot.dia] ?? slot.dia) : null,
      profesorNombre: owner?.name ?? 'Tallerista',
      direccion: loc ? `${loc.direccion}, ${loc.comuna}, ${loc.ciudad}` : null,
    })
  }

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Mis talleres</h1>

        {params.pago === 'ok' && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
            ¡Inscripción confirmada! Ya estás inscrito.
          </div>
        )}
        {params.pago === 'error' && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
            Hubo un problema con el pago. Intenta nuevamente.
          </div>
        )}

        {result.data.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl">
            <p className="text-5xl mb-4">📚</p>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Aún no tienes inscripciones</h2>
            <p className="text-gray-500 mb-4">Busca talleres que te interesen y regístrate.</p>
            <Link href="/talleres" className="text-purple-600 font-medium hover:underline">
              Explorar talleres →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {result.data.map((e) => {
              const w = e.workshopId as unknown as { _id: string; titulo: string; slug: string; tipo: string } | null
              const esPrueba = (e as unknown as { esClasePrueba?: boolean }).esClasePrueba === true
              return (
                <div key={String(e._id)} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/talleres/${w?.slug || ''}`}
                          className="font-semibold text-gray-900 hover:text-purple-700"
                        >
                          {w?.titulo || 'Taller'}
                        </Link>
                        {esPrueba && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                            Clase de prueba
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-xs px-2 py-1 rounded-full ${estadoBadge[e.estado]}`}>
                          {e.estado}
                        </span>
                        <span className="text-sm text-gray-500">
                          ${e.monto.toLocaleString('es-CL')}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(e.createdAt).toLocaleDateString('es-CL')}
                        </span>
                      </div>
                    </div>
                    {e.estado === 'pendiente' && (
                      <CancelButton enrollmentId={String(e._id)} />
                    )}
                  </div>

                  {/* Detalles de clase de prueba pagada */}
                  {esPrueba && e.estado === 'pagado' && pruebaMap.has(String(e._id)) && (() => {
                    const cp = pruebaMap.get(String(e._id))!
                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {cp.horaInicio && (
                          <div className="flex items-start gap-2">
                            <span className="text-amber-500 shrink-0">🕐</span>
                            <div>
                              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Horario</p>
                              <p className="text-gray-800 font-medium">
                                {cp.diaSemana ?? ''}
                                {cp.fechaSlot
                                  ? ` ${new Date(cp.fechaSlot + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}`
                                  : ''}
                              </p>
                              <p className="text-gray-600">{cp.horaInicio} – {cp.horaFin} hrs</p>
                            </div>
                          </div>
                        )}
                        <div className="flex items-start gap-2">
                          <span className="text-amber-500 shrink-0">👤</span>
                          <div>
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Profesor/a</p>
                            <p className="text-gray-800 font-medium">{cp.profesorNombre}</p>
                          </div>
                        </div>
                        {cp.direccion && (
                          <div className="flex items-start gap-2 sm:col-span-2">
                            <span className="text-amber-500 shrink-0">📍</span>
                            <div>
                              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Dirección</p>
                              <p className="text-gray-800">{cp.direccion}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* CTA conversión */}
                  {esPrueba && e.estado === 'pagado' && w?.slug && (
                    <div className="border-t border-gray-100 pt-2">
                      <Link
                        href={`/talleres/${w.slug}`}
                        className="text-sm text-purple-600 hover:text-purple-800 font-medium underline"
                      >
                        Suscribirme al taller completo →
                      </Link>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
      <Footer />
    </>
  )
}
