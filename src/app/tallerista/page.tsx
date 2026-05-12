import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import dbConnect from '@/lib/db'
import CalendarioResumen from './CalendarioResumen'
import Workshop from '@/models/Workshop'
import Enrollment from '@/models/Enrollment'
import Subscription from '@/models/Subscription'
import Booking from '@/models/Booking'
import PaymentBreakdown from '@/models/PaymentBreakdown'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

interface PBLean { montoProfesor: number; estado: string }

export default async function TalleristaDashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  // Si aún no está aprobado, el layout ya lo maneja. Acá asumimos aprobado.
  if (session.user.tallerEstado !== 'aprobado') {
    redirect('/tallerista/onboarding')
  }

  await dbConnect()
  const ownerId = session.user.id

  const misWorkshops = await Workshop.find({
    $or: [{ ownerId }, { accountId: ownerId }],
    activo: true,
    deletedAt: null,
  }).select('_id').lean<{ _id: Types.ObjectId }[]>()

  const workshopIds = misWorkshops.map(w => w._id)

  const [totalTalleres, enrollmentsActivos, subscripcionesActivas, reagendPendientes, pagos] = await Promise.all([
    Workshop.countDocuments({ $or: [{ ownerId }, { accountId: ownerId }], activo: true, deletedAt: null }),
    Enrollment.countDocuments({ workshopId: { $in: workshopIds }, estado: 'pagado', activo: true }),
    Subscription.countDocuments({ workshopId: { $in: workshopIds }, estado: 'activa', activo: true }),
    Booking.countDocuments({
      workshopId: { $in: workshopIds },
      'reagendamiento.estado': 'pendiente',
      activo: true,
    }),
    PaymentBreakdown.find({ $or: [{ ownerId }, { accountId: ownerId }], tipo: 'pago' })
      .select('montoProfesor estado')
      .lean<PBLean[]>(),
  ])

  const ingresoNeto = pagos.reduce((acc, p) => acc + (p.montoProfesor ?? 0), 0)
  const pendienteLiquidar = pagos
    .filter(p => p.estado === 'recibido')
    .reduce((acc, p) => acc + (p.montoProfesor ?? 0), 0)

  const cards: { label: string; value: string; href?: string; highlight?: boolean }[] = [
    { label: 'Talleres publicados', value: String(totalTalleres), href: '/tallerista/talleres' },
    { label: 'Inscripciones pagadas', value: String(enrollmentsActivos) },
    { label: 'Suscripciones activas', value: String(subscripcionesActivas) },
    {
      label: 'Reagendamientos pendientes',
      value: String(reagendPendientes),
      href: '/tallerista/reagendamientos',
      highlight: reagendPendientes > 0,
    },
    { label: 'Ganancia neta acumulada', value: `$${ingresoNeto.toLocaleString('es-CL')}`, href: '/tallerista/finanzas' },
    { label: 'Pendiente de liquidar', value: `$${pendienteLiquidar.toLocaleString('es-CL')}`, href: '/tallerista/liquidaciones' },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Panel tallerista</h1>
        <p className="text-sm text-gray-500 mt-1">Hola {session.user.name ?? ''}, este es el resumen de tu actividad.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(card => {
          const content = (
            <div
              className={`bg-white border rounded-xl px-5 py-4 h-full transition-colors ${
                card.highlight
                  ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
                  : 'border-gray-200 hover:border-purple-300'
              }`}
            >
              <p className="text-xs uppercase tracking-wide text-gray-500">{card.label}</p>
              <p className={`mt-2 text-2xl font-bold ${card.highlight ? 'text-amber-700' : 'text-gray-900'}`}>
                {card.value}
              </p>
            </div>
          )
          return card.href ? (
            <Link key={card.label} href={card.href}>{content}</Link>
          ) : (
            <div key={card.label}>{content}</div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Link
          href="/tallerista/talleres/nuevo"
          className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg"
        >
          + Publicar nuevo taller
        </Link>
        <Link
          href="/tallerista/talleres"
          className="bg-white border border-gray-200 hover:border-purple-300 text-gray-700 text-sm px-4 py-2 rounded-lg"
        >
          Ver mis talleres
        </Link>
        <Link
          href="/tallerista/perfil"
          className="bg-white border border-gray-200 hover:border-purple-300 text-gray-700 text-sm px-4 py-2 rounded-lg"
        >
          Editar mi perfil
        </Link>
      </div>

      <Suspense fallback={
        <div className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
          <div className="h-4 w-40 bg-gray-200 rounded mb-4" />
          <div className="space-y-3">
            <div className="h-14 bg-gray-100 rounded-lg" />
            <div className="h-14 bg-gray-100 rounded-lg" />
            <div className="h-14 bg-gray-100 rounded-lg" />
          </div>
        </div>
      }>
        <CalendarioResumen ownerId={ownerId} />
      </Suspense>
    </div>
  )
}
