import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import dbConnect from '@/lib/db'
import Liquidation from '@/models/Liquidation'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

interface LiquidationLean {
  _id: Types.ObjectId
  estado: string
  totalBruto: number
  totalFeeTallerea: number
  totalProfesor: number
  cantidadPagos: number
  periodo: { desde: Date; hasta: Date }
  comprobanteUrl?: string
  createdAt: Date
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  pagada: 'bg-green-100 text-green-700',
  rechazada: 'bg-red-100 text-red-500',
}

export default async function LiquidacionesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  await dbConnect()
  const ownerId = session.user.id

  const liquidaciones = await Liquidation.find({ ownerId })
    .sort({ createdAt: -1 })
    .lean<LiquidationLean[]>()

  const totalPagado = liquidaciones
    .filter(l => l.estado === 'pagada')
    .reduce((s, l) => s + l.totalProfesor, 0)

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Liquidaciones</h1>
        <Link href="/tallerista/finanzas" className="text-sm text-indigo-600 hover:underline">← Finanzas</Link>
      </div>

      {/* Resumen */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex justify-between items-center">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total recibido</p>
          <p className="text-2xl font-bold text-green-700 mt-1">${totalPagado.toLocaleString('es-CL')}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">{liquidaciones.length} liquidación{liquidaciones.length !== 1 ? 'es' : ''}</p>
          <p className="text-xs text-gray-400">{liquidaciones.filter(l => l.estado === 'pendiente').length} pendiente{liquidaciones.filter(l => l.estado === 'pendiente').length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Lista */}
      {liquidaciones.length === 0 ? (
        <p className="text-sm text-gray-400">Sin liquidaciones aún. Los pagos se liquidan periódicamente.</p>
      ) : (
        <div className="space-y-3">
          {liquidaciones.map(l => (
            <div key={String(l._id)} className="bg-white border border-gray-200 rounded-xl px-5 py-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {new Date(l.periodo.desde).toLocaleDateString('es-CL')} — {new Date(l.periodo.hasta).toLocaleDateString('es-CL')}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {l.cantidadPagos} pago{l.cantidadPagos !== 1 ? 's' : ''} ·
                    Bruto ${l.totalBruto.toLocaleString('es-CL')} ·
                    Fee ${l.totalFeeTallerea.toLocaleString('es-CL')}
                  </p>
                </div>
                <div className="text-right ml-4">
                  <p className="text-lg font-bold text-gray-900">${l.totalProfesor.toLocaleString('es-CL')}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[l.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                    {l.estado}
                  </span>
                </div>
              </div>
              {l.comprobanteUrl && (
                <a href={l.comprobanteUrl} target="_blank" rel="noreferrer"
                  className="text-xs text-indigo-600 hover:underline mt-2 inline-block">
                  Ver comprobante →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
