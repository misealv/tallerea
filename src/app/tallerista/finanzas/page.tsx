import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import dbConnect from '@/lib/db'
import PaymentBreakdown from '@/models/PaymentBreakdown'
import Liquidation from '@/models/Liquidation'
import ManualPaymentRecord from '@/models/ManualPaymentRecord'
import Workshop from '@/models/Workshop'
import { Types } from 'mongoose'
import ManualPaymentForm from '@/components/ManualPaymentForm'
import BorrarManualPaymentButton from '@/components/BorrarManualPaymentButton'

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

  const [breakdowns, manualRecords, liquidaciones] = await Promise.all([
    PaymentBreakdown.find({ ownerId, tipo: { $in: ['pago', 'ajuste'] } })
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
    // [INMUTABLE] Los breakdowns ya no se marcan estado:'liquidado';
    // la fuente de verdad es Liquidation.breakdowns[]
    Liquidation.find({ ownerId }).select('breakdowns').lean<{ breakdowns: Types.ObjectId[] }[]>(),
  ])

  // Conjunto de IDs de breakdowns ya incluidos en alguna liquidación
  const liquidadosIds = new Set(
    liquidaciones.flatMap(l => l.breakdowns.map(id => String(id)))
  )

  // Totales checkout (PaymentBreakdown)
  // cobrados = todos con pago confirmado (incluye los ya liquidados para el total histórico)
  const cobrados = breakdowns.filter(b =>
    b.estado === 'cobrado' || b.estado === 'liquidado' || liquidadosIds.has(String(b._id))
  )
  // porLiquidar = cobrados que aún no pertenecen a ninguna liquidación
  const porLiquidar = breakdowns.filter(b =>
    b.estado === 'cobrado' && !liquidadosIds.has(String(b._id))
  )
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
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
            <>
              {/* Tabla — desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                    <th className="px-3 py-2">Taller</th>
                    <th className="px-3 py-2">Bruto</th>
                    <th className="px-3 py-2">Tu ganancia</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Fecha</th>
                  </tr></thead>
                  <tbody>{breakdowns.map(b => (
                    <tr key={String(b._id)} className={`border-t border-gray-100 ${b.tipo === 'ajuste' ? 'bg-red-50' : ''}`}>
                      <td className="px-3 py-2 text-gray-800 max-w-[120px] truncate">{(b.workshopId as { titulo: string })?.titulo ?? '—'}</td>
                      <td className={`px-3 py-2 ${b.tipo === 'ajuste' ? 'text-red-600' : ''}`}>${b.montoBruto.toLocaleString('es-CL')}</td>
                      <td className={`px-3 py-2 font-medium ${b.tipo === 'ajuste' ? 'text-red-600' : 'text-indigo-700'}`}>${b.montoProfesor.toLocaleString('es-CL')}</td>
                      <td className="px-3 py-2">
                        {b.tipo === 'ajuste'
                          ? <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">ajuste</span>
                          : <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[b.estado] ?? ''}`}>{b.estado}</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-gray-400">{new Date(b.createdAt).toLocaleDateString('es-CL')}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {/* Cards — móvil */}
              <div className="md:hidden space-y-2">
                {breakdowns.map(b => (
                  <div key={String(b._id)} className={`border rounded-xl p-3 flex items-center justify-between gap-3 ${b.tipo === 'ajuste' ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{(b.workshopId as { titulo: string })?.titulo ?? '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(b.createdAt).toLocaleDateString('es-CL')}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold ${b.tipo === 'ajuste' ? 'text-red-600' : 'text-indigo-700'}`}>${b.montoProfesor.toLocaleString('es-CL')}</p>
                      {b.tipo === 'ajuste'
                        ? <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-700">ajuste</span>
                        : <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ESTADO_COLOR[b.estado] ?? ''}`}>{b.estado}</span>
                      }
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Columna 2 — Pagos manuales declarados */}
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-1">Pagos manuales declarados</h2>
          <p className="text-xs text-gray-400 mb-3">Solo informativos. No generan comisión ni entran en liquidaciones.</p>

          {manualRecords.length === 0 ? (
            <p className="text-sm text-gray-400 mb-4">Sin registros manuales aún.</p>
          ) : (
            <>
              {/* Tabla — desktop */}
              <div className="hidden md:block overflow-x-auto mb-6">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                    <th className="px-3 py-2">Taller</th>
                    <th className="px-3 py-2">Alumno</th>
                    <th className="px-3 py-2">Monto</th>
                    <th className="px-3 py-2">Método</th>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Comp.</th>
                    <th className="px-3 py-2"></th>
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
                      <td className="px-3 py-2"><BorrarManualPaymentButton id={String(r._id)} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {/* Cards — móvil */}
              <div className="md:hidden space-y-2 mb-6">
                {manualRecords.map(r => (
                  <div key={String(r._id)} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{(r.workshopId as { titulo: string })?.titulo ?? '—'}</p>
                        <p className="text-xs text-gray-500 truncate">{(r.studentId as { name: string })?.name ?? '—'}</p>
                      </div>
                      <p className="text-sm font-bold text-gray-800 shrink-0">${r.monto.toLocaleString('es-CL')}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded-full font-medium ${
                        r.metodoPago === 'transferencia' ? 'bg-blue-100 text-blue-700'
                        : r.metodoPago === 'efectivo' ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                      }`}>{r.metodoPago}</span>
                      <span className="text-gray-400">{new Date(r.fecha).toLocaleDateString('es-CL')}</span>
                      {r.comprobanteUrl && (
                        <a href={r.comprobanteUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">Comprobante</a>
                      )}
                      <BorrarManualPaymentButton id={String(r._id)} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {workshops.length > 0 && (
            <ManualPaymentForm workshops={workshopsForForm} />
          )}
        </section>

      </div>
    </div>
  )
}
