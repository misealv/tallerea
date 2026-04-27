import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CreditService } from '@/services/CreditService'

export const dynamic = 'force-dynamic'

const TIPO_LABEL: Record<string, string> = {
  otorgado: 'Crédito otorgado',
  usado:    'Crédito usado',
  caducado: 'Crédito caducado',
  ajuste:   'Ajuste',
}
const TIPO_COLOR: Record<string, string> = {
  otorgado: 'text-green-600',
  usado:    'text-red-500',
  caducado: 'text-gray-400',
  ajuste:   'text-indigo-500',
}

export default async function CreditoPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/alumno/acceso')

  const [saldo, historial] = await Promise.all([
    CreditService.getSaldo(session.user.id),
    CreditService.getHistorial(session.user.id, 1, 20),
  ])

  return (
    <div className="space-y-8 max-w-lg">
      <div>
        <Link href="/alumno" className="text-sm text-indigo-600 hover:underline">← Volver</Link>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">Saldo a favor</h1>
      </div>

      {/* Tarjeta saldo */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-100 border border-green-200 rounded-2xl px-8 py-8 text-center">
        <p className="text-sm font-semibold text-green-700 uppercase tracking-widest mb-2">Saldo actual</p>
        <p className="text-5xl font-bold text-green-800">
          ${saldo.toLocaleString('es-CL')}
        </p>
        <p className="text-xs text-green-600 mt-3">CLP — aplicable en tu próxima inscripción</p>
      </div>

      {/* Información */}
      <div className="bg-white border border-gray-100 rounded-xl px-6 py-5 space-y-3 text-sm text-gray-600">
        <p className="font-semibold text-gray-800">¿Cómo funciona el saldo a favor?</p>
        <ul className="list-disc list-inside space-y-1.5 text-gray-500">
          <li>Recibes saldo cuando se cancela una inscripción y se genera un reembolso.</li>
          <li>El saldo se descuenta automáticamente al comprar tu próximo taller o paquete.</li>
          <li>No sirve para pagar clases ya inscritas—solo para nuevas compras.</li>
          <li>No caduca mientras tu cuenta esté activa.</li>
        </ul>
      </div>

      {/* Historial */}
      {historial.data.length > 0 ? (
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Movimientos</h2>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
            {historial.data.map(tx => (
              <li key={String(tx._id)} className="flex items-center justify-between px-4 py-3 bg-white text-sm">
                <div>
                  <p className={`font-medium ${TIPO_COLOR[tx.tipo] ?? 'text-gray-700'}`}>
                    {TIPO_LABEL[tx.tipo] ?? tx.tipo}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{tx.motivo}</p>
                  <p className="text-xs text-gray-300">
                    {new Date(tx.createdAt).toLocaleDateString('es-CL')}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${tx.monto >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.monto >= 0 ? '+' : ''}{tx.monto.toLocaleString('es-CL')}
                  </p>
                  <p className="text-xs text-gray-400">
                    Saldo: ${tx.saldoResultante.toLocaleString('es-CL')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center">
          No tienes movimientos aún.{' '}
          <Link href="/talleres" className="text-indigo-600 hover:underline">Explorar talleres →</Link>
        </p>
      )}
    </div>
  )
}
