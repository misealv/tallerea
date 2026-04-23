import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import dbConnect from '@/lib/db'
import User from '@/models/User'

export const dynamic = 'force-dynamic'

export default async function CreditoPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/alumno/acceso')

  await dbConnect()
  const user = await User.findById(session.user.id)
    .select('name creditoDisponible')
    .lean<{ name: string; creditoDisponible: number }>()

  const credito = user?.creditoDisponible ?? 0

  return (
    <div className="space-y-8 max-w-lg">
      <div>
        <Link href="/alumno" className="text-sm text-indigo-600 hover:underline">← Volver</Link>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">Crédito disponible</h1>
      </div>

      {/* Tarjeta saldo */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-100 border border-green-200 rounded-2xl px-8 py-8 text-center">
        <p className="text-sm font-semibold text-green-700 uppercase tracking-widest mb-2">Saldo actual</p>
        <p className="text-5xl font-bold text-green-800">
          ${credito.toLocaleString('es-CL')}
        </p>
        <p className="text-xs text-green-600 mt-3">CLP — aplicable en tu próxima inscripción</p>
      </div>

      {/* Información */}
      <div className="bg-white border border-gray-100 rounded-xl px-6 py-5 space-y-3 text-sm text-gray-600">
        <p className="font-semibold text-gray-800">¿Cómo funciona el crédito?</p>
        <ul className="list-disc list-inside space-y-1.5 text-gray-500">
          <li>Recibes crédito cuando se cancela una inscripción dentro del plazo.</li>
          <li>El crédito se descuenta automáticamente al pagar tu próxima clase.</li>
          <li>No caduca mientras tu cuenta esté activa.</li>
        </ul>
      </div>

      {credito === 0 && (
        <p className="text-sm text-gray-400 text-center">
          No tienes crédito acumulado aún.{' '}
          <Link href="/talleres" className="text-indigo-600 hover:underline">Explorar talleres →</Link>
        </p>
      )}
    </div>
  )
}
