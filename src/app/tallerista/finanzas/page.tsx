import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import dbConnect from '@/lib/db'
import PaymentBreakdown from '@/models/PaymentBreakdown'
import ManualPaymentRecord from '@/models/ManualPaymentRecord'
import Workshop from '@/models/Workshop'
import { Types } from 'mongoose'
import ManualPaymentForm from '@/components/ManualPaymentForm'

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

interface ManualRecordLean {
  _id: Types.ObjectId
  workshopId: { titulo: string }
  studentId: { name: string; email: string }
  monto: number
  metodoPago: string
  fecha: Date
  notas?: string
  comprobanteUrl?: string
  createdAt: Date
}

interface WorkshopOption {
  _id: Types.ObjectId
  titulo: string
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

  // Obtener IDs de workshops del tallerista para scoping
  const workshops = await Workshop.find({ ownerId, activo: true }).select('_id titulo').lean<WorkshopOption[]>()
  const workshopIds = workshops.map(w => w._id)

  const [breakdowns, manualRecords] = await Promise.all([
    PaymentBreakdown.find({ ownerId, tipo: 'pago' })
      .populate('workshopId', 'titulo')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean<BreakdownLean[]>(),
    ManualPaymentRecord.find({ ownerId, workshopId: { $in: workshopIds } })
      .populate('workshopId', 'titulo')
      .populate('studentId', 'name email')
      .sort({ fecha: -1 })
      .limit(100)
      .lean<ManualRecordLean[]>(),
  ])

  // Totales checkout (PaymentBreakdown)
  const cobrados = breakdowns.filter(b => b.estado === 'cobrado' || b.estado === 'liquidado')
  const porLiquidar = breakdowns.filter(b => b.estado === 'cobrado')
  const totalBruto = cobrados.reduce((s, b) => s + b.montoBruto, 0)
  const totalProfesor = cobrados.reduce((s, b) => s + b.montoProfesor, 0)
  const pendienteLiquidar = porLiquidar.reduce((s, b) => s + b.montoProfesor, 0)

  // Totales registros manuales declarativos
  const totalManualDeclarado = manualRecords.reduce((s, r) => s + r.monto, 0)

  // Workshops para el formulario (serializable)
  const workshopsForForm = workshops.map(w => ({ _id: String(w._id), titulo: w.titulo }))

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
          <p className="text-xs text-gray-400 mt-0.5">{manualRecords.length} registro{manualRecords.length !== 1 ? 's' : ''} · No entra en liquidaciones</p>
        </div>
      </div>

      {/* Dos columnas: Ingresos en línea / Pagos manuales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Columna 1 — Ingresos en línea (checkout) */}
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Ingresos en línea (checkout)</h2>
          {breakdowns.length === 0 ? (
            <p className="text-sm text-gray-400">Sin pagos online registrados aún.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <th className="px-3 py-2">Taller</th>
                  <th className="px-3 py-2">Bruto</th>
                  <th className="px-3 py-2">Tu ganancia</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Fecha</th>
                </tr></thead>
                <tbody>{breakdowns.map(b => (
                  <tr key={String(b._id)} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-800 max-w-[120px] truncate">{(b.workshopId as { titulo: string })?.titulo ?? '—'}</td>
                    <td className="px-3 py-2">${b.montoBruto.toLocaleString('es-CL')}</td>
                    <td className="px-3 py-2 font-medium text-indigo-700">${b.montoProfesor.toLocaleString('es-CL')}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[b.estado] ?? ''}`}>{b.estado}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-400">{new Date(b.createdAt).toLocaleDateString('es-CL')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        {/* Columna 2 — Pagos manuales declarados */}
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-1">Pagos manuales declarados</h2>
          <p className="text-xs text-gray-400 mb-3">Solo informativos. No generan comisión ni entran en liquidaciones.</p>

          {manualRecords.length === 0 ? (
            <p className="text-sm text-gray-400 mb-4">Sin registros manuales aún.</p>
          ) : (
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm border-collapse">
                <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <th className="px-3 py-2">Taller</th>
                  <th className="px-3 py-2">Alumno</th>
                  <th className="px-3 py-2">Monto</th>
                  <th className="px-3 py-2">Método</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Comp.</th>
                </tr></thead>
                <tbody>{manualRecords.map(r => (
                  <tr key={String(r._id)} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-800 max-w-[100px] truncate">{(r.workshopId as { titulo: string })?.titulo ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-700 max-w-[100px] truncate">{(r.studentId as { name: string })?.name ?? '—'}</td>
                    <td className="px-3 py-2 font-medium">${r.monto.toLocaleString('es-CL')}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        r.metodoPago === 'transferencia' ? 'bg-blue-100 text-blue-700'
                        : r.metodoPago === 'efectivo' ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                      }`}>{r.metodoPago}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-400">{new Date(r.fecha).toLocaleDateString('es-CL')}</td>
                    <td className="px-3 py-2">
                      {r.comprobanteUrl
                        ? <a href={r.comprobanteUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline text-xs">ver</a>
                        : <span className="text-gray-300 text-xs">—</span>
                      }
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {workshops.length > 0 && (
            <ManualPaymentForm workshops={workshopsForForm} />
          )}
        </section>

      </div>
    </div>
  )
}
