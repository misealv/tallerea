import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import dbConnect from '@/lib/db'
import PaymentBreakdown from '@/models/PaymentBreakdown'
import Enrollment from '@/models/Enrollment'
import Subscription from '@/models/Subscription'
import Workshop from '@/models/Workshop'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

interface BreakdownLean {
  _id: Types.ObjectId
  workshopId: { titulo: string }
  montoBruto: number
  feeTallerea: number
  montoProfesor: number
  comisionMP: number
  estado: string
  tipo: string
  fechaCobro?: Date
  createdAt: Date
}

interface EnrollmentManualLean {
  _id: Types.ObjectId
  workshopId: { titulo: string }
  monto: number
  createdAt: Date
}

interface SubManualLean {
  _id: Types.ObjectId
  workshopId: { titulo: string }
  precioSnapshot?: number
  monto: number
  precioEspecial: boolean
  createdAt: Date
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  cobrado: 'bg-blue-100 text-blue-700',
  liquidado: 'bg-green-100 text-green-700',
  reembolsado: 'bg-gray-100 text-gray-500',
}

export default async function FinanzasPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  await dbConnect()
  const ownerId = session.user.id

  // Obtener IDs de workshops del tallerista para scoping correcto
  const workshopIds = await Workshop.find({ ownerId, activo: true }).distinct('_id')

  const [breakdowns, enrollmentsManuales, subscriptionesManuales] = await Promise.all([
    PaymentBreakdown.find({ ownerId, tipo: 'pago' })
      .populate('workshopId', 'titulo')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean<BreakdownLean[]>(),
    // Inscripciones manuales puntuales: scoped por workshopId del owner
    Enrollment.find({ workshopId: { $in: workshopIds }, activo: true, origenInscripcion: 'manual' })
      .populate('workshopId', 'titulo')
      .sort({ createdAt: -1 })
      .lean<EnrollmentManualLean[]>(),
    // Suscripciones manuales: scoped por workshopId del owner
    Subscription.find({ workshopId: { $in: workshopIds }, activo: true, origenInscripcion: 'manual' })
      .populate('workshopId', 'titulo')
      .sort({ createdAt: -1 })
      .lean<SubManualLean[]>(),
  ])

  // Totales checkout (PaymentBreakdown)
  const cobrados = breakdowns.filter(b => b.estado === 'cobrado' || b.estado === 'liquidado')
  const porLiquidar = breakdowns.filter(b => b.estado === 'cobrado')
  const totalBruto = cobrados.reduce((s, b) => s + b.montoBruto, 0)
  const totalProfesor = cobrados.reduce((s, b) => s + b.montoProfesor, 0)
  const pendienteLiquidar = porLiquidar.reduce((s, b) => s + b.montoProfesor, 0)

  // Totales manuales declarativos (sin PaymentBreakdown)
  const totalManualDeclarado =
    enrollmentsManuales.reduce((s, e) => s + e.monto, 0) +
    subscriptionesManuales.reduce((s, sub) => s + (sub.precioEspecial ? (sub.precioSnapshot ?? sub.monto) : sub.monto), 0)

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Finanzas</h1>
        <Link href="/tallerista/liquidaciones" className="text-sm text-indigo-600 hover:underline">Ver liquidaciones →</Link>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Ingresos brutos (online)</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">${totalBruto.toLocaleString('es-CL')}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Tu ganancia neta</p>
          <p className="text-2xl font-bold text-indigo-700 mt-1">${totalProfesor.toLocaleString('es-CL')}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
          <p className="text-xs text-amber-700 uppercase tracking-wide font-semibold">Pendiente liquidar</p>
          <p className="text-2xl font-bold text-amber-800 mt-1">${pendienteLiquidar.toLocaleString('es-CL')}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Pagos manuales declarados</p>
          <p className="text-2xl font-bold text-gray-700 mt-1">${totalManualDeclarado.toLocaleString('es-CL')}</p>
          <p className="text-xs text-gray-400 mt-0.5">Total histórico · No entra en liquidaciones</p>
        </div>
      </div>

      {/* Tabla de pagos online */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Últimos 50 pagos online (checkout)</h2>
        {breakdowns.length === 0 ? (
          <p className="text-sm text-gray-400">Sin pagos registrados aún.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-3 py-2">Taller</th><th className="px-3 py-2">Bruto</th>
                <th className="px-3 py-2">Fee MP</th><th className="px-3 py-2">Fee Tallerea</th>
                <th className="px-3 py-2">Tu ganancia</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Fecha</th>
              </tr></thead>
              <tbody>{breakdowns.map(b => (
                <tr key={String(b._id)} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-800">{(b.workshopId as { titulo: string })?.titulo ?? '—'}</td>
                  <td className="px-3 py-2">${b.montoBruto.toLocaleString('es-CL')}</td>
                  <td className="px-3 py-2 text-gray-400">${b.comisionMP.toLocaleString('es-CL')}</td>
                  <td className="px-3 py-2 text-gray-400">${b.feeTallerea.toLocaleString('es-CL')}</td>
                  <td className="px-3 py-2 font-medium text-indigo-700">${b.montoProfesor.toLocaleString('es-CL')}</td>
                  <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[b.estado] ?? ''}`}>{b.estado}</span></td>
                  <td className="px-3 py-2 text-gray-400">{new Date(b.createdAt).toLocaleDateString('es-CL')}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {/* Inscripciones manuales */}
      {(enrollmentsManuales.length > 0 || subscriptionesManuales.length > 0) && (
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-1">Inscripciones manuales</h2>
          <p className="text-xs text-gray-400 mb-3">Pagos declarados fuera del sistema. No entran en liquidaciones ni comisiones.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-3 py-2">Taller</th><th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Monto declarado</th><th className="px-3 py-2">Fecha</th>
              </tr></thead>
              <tbody>
                {enrollmentsManuales.map(e => (
                  <tr key={String(e._id)} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-800">{(e.workshopId as { titulo: string })?.titulo ?? '—'}</td>
                    <td className="px-3 py-2"><span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">puntual</span></td>
                    <td className="px-3 py-2">${e.monto.toLocaleString('es-CL')}</td>
                    <td className="px-3 py-2 text-gray-400">{new Date(e.createdAt).toLocaleDateString('es-CL')}</td>
                  </tr>
                ))}
                {subscriptionesManuales.map(s => {
                  const monto = s.precioEspecial ? (s.precioSnapshot ?? s.monto) : s.monto
                  return (
                    <tr key={String(s._id)} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-800">{(s.workshopId as { titulo: string })?.titulo ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">recurrente</span>
                        {s.precioEspecial && (
                          <span className="ml-1 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">precio especial</span>
                        )}
                      </td>
                      <td className="px-3 py-2">${monto.toLocaleString('es-CL')}</td>
                      <td className="px-3 py-2 text-gray-400">{new Date(s.createdAt).toLocaleDateString('es-CL')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
