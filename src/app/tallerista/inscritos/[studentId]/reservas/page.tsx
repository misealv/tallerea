import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import dbConnect from '@/lib/db'
import Booking from '@/models/Booking'
import Workshop from '@/models/Workshop'
import Subscription from '@/models/Subscription'
import User from '@/models/User'
import { Types } from 'mongoose'
import PaqueteCard from '@/components/PaqueteCard'

export const dynamic = 'force-dynamic'

const ESTADO_LABEL: Record<string, { label: string; color: string }> = {
  reservada:    { label: 'Reservada',    color: 'bg-indigo-100 text-indigo-700' },
  asistio:      { label: 'Asistió',      color: 'bg-green-100 text-green-700' },
  no_asistio:   { label: 'No asistió',   color: 'bg-red-100 text-red-700' },
  cancelada:    { label: 'Cancelada',    color: 'bg-gray-100 text-gray-400' },
}

interface BookingLean {
  _id: Types.ObjectId
  workshopId: { _id: Types.ObjectId; titulo: string }
  slotIndex: number
  fecha: Date
  estado: string
  canceladaRazon?: string | null
  reservadoPor: string
  dependentNombreSnapshot?: string
  createdAt: Date
}

interface UserLean {
  _id: Types.ObjectId
  name: string
  email: string
}

export default async function ReservasPorAlumnoPage({
  params,
}: {
  params: { studentId: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')
  if (session.user.tallerEstado !== 'aprobado' && session.user.role !== 'admin') {
    redirect('/tallerista/onboarding')
  }

  if (!Types.ObjectId.isValid(params.studentId)) notFound()

  await dbConnect()
  const ownerId = new Types.ObjectId(session.user.id)
  const studentObjId = new Types.ObjectId(params.studentId)

  // Verificar que el alumno existe
  const alumno = await User.findById(studentObjId).select('name email').lean<UserLean>()
  if (!alumno) notFound()

  // Solo workshops del tallerista autenticado — garantía multi-tenant
  const workshopIds = await Workshop.distinct('_id', { ownerId, activo: true })

  // Subs activas del alumno en talleres del tallerista — para mostrar paquete editable
  const subsActivas = await Subscription.find({
    studentId: studentObjId,
    workshopId: { $in: workshopIds },
    estado: 'activa',
    activo: true,
  })
    .populate<{ workshopId: { _id: Types.ObjectId; titulo: string } }>('workshopId', '_id titulo')
    .sort({ createdAt: -1 })
    .lean<Array<{
      _id: Types.ObjectId
      workshopId: { _id: Types.ObjectId; titulo: string }
      sesionesTotales: number
      sesionesUsadas: number
      sesionesDisponibles: number
      precioSnapshot?: number
      monto: number
      autoRenovar: boolean
      notaPrecioEspecial?: string
      dependentNombreSnapshot?: string
      clasesPrepagadas?: { cantidad?: number; caducaEn?: Date }
      fechaVencimiento: Date
    }>>()

  const bookings = await Booking.find({
    studentId: studentObjId,
    workshopId: { $in: workshopIds },
    activo: true,
  })
    .populate<{ workshopId: { _id: Types.ObjectId; titulo: string } }>('workshopId', '_id titulo')
    .sort({ fecha: -1 })
    .lean<BookingLean[]>()

  // Agrupar por taller
  const porTaller = bookings.reduce<Record<string, { titulo: string; items: BookingLean[] }>>(
    (acc, b) => {
      const wid = String(b.workshopId._id)
      if (!acc[wid]) acc[wid] = { titulo: b.workshopId.titulo, items: [] }
      acc[wid].items.push(b)
      return acc
    },
    {}
  )

  const total = bookings.length
  const asistidas = bookings.filter(b => b.estado === 'asistio').length
  const reservadas = bookings.filter(b => b.estado === 'reservada').length
  const canceladas = bookings.filter(b => b.estado === 'cancelada').length

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <Link href="/tallerista/inscritos" className="text-indigo-600 hover:underline text-sm">
          ← Inscritos
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-800">{alumno.name}</h1>
          <p className="text-sm text-gray-500">{alumno.email}</p>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',     value: total,     color: 'bg-gray-50 border-gray-200 text-gray-700' },
          { label: 'Asistió',   value: asistidas, color: 'bg-green-50 border-green-200 text-green-700' },
          { label: 'Reservada', value: reservadas, color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
          { label: 'Cancelada', value: canceladas, color: 'bg-gray-50 border-gray-200 text-gray-400' },
        ].map(card => (
          <div key={card.label} className={`rounded-xl border px-4 py-3 text-center ${card.color}`}>
            <p className="text-2xl font-bold">{card.value}</p>
            <p className="text-xs mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Paquetes activos por taller — editables */}
      {subsActivas.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Paquetes activos</h2>
          {subsActivas.map(s => {
            const caduca = s.clasesPrepagadas?.caducaEn ?? s.fechaVencimiento
            return (
              <PaqueteCard
                key={String(s._id)}
                subscriptionId={String(s._id)}
                workshopTitulo={s.workshopId.titulo}
                dependentNombre={s.dependentNombreSnapshot ?? null}
                cantidad={s.clasesPrepagadas?.cantidad ?? s.sesionesTotales}
                sesionesUsadas={s.sesionesUsadas}
                sesionesDisponibles={s.sesionesDisponibles}
                precio={s.precioSnapshot ?? s.monto ?? 0}
                caducaEn={caduca ? new Date(caduca).toISOString() : null}
                autoRenovar={s.autoRenovar}
                notaPrecio={s.notaPrecioEspecial ?? null}
              />
            )
          })}
        </div>
      )}

      {/* Sin reservas */}
      {total === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-10 text-center text-gray-500 text-sm">
          Este alumno no tiene reservas registradas en tus talleres.
        </div>
      )}

      {/* Agrupado por taller */}
      {Object.entries(porTaller).map(([wid, { titulo, items }]) => (
        <div key={wid} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Cabecera del taller */}
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <p className="font-medium text-gray-800 text-sm">{titulo}</p>
            <span className="text-xs text-gray-500">{items.length} reserva{items.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Tabla desktop */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-2 text-left font-medium">Fecha</th>
                  <th className="px-5 py-2 text-left font-medium">Sesión</th>
                  <th className="px-5 py-2 text-left font-medium">Estado</th>
                  <th className="px-5 py-2 text-left font-medium">Reservado por</th>
                  <th className="px-5 py-2 text-left font-medium">Para</th>
                  <th className="px-5 py-2 text-left font-medium">Creada el</th>
                </tr>
              </thead>
              <tbody>
                {items.map(b => {
                  const estadoInfo = ESTADO_LABEL[b.estado] ?? { label: b.estado, color: 'bg-gray-100 text-gray-500' }
                  return (
                    <tr key={String(b._id)} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-800">
                        {new Date(b.fecha).toLocaleDateString('es-CL', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </td>
                      <td className="px-5 py-3 text-gray-600">#{b.slotIndex + 1}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estadoInfo.color}`}>
                          {estadoInfo.label}
                        </span>
                        {b.canceladaRazon && (
                          <span className="ml-1 text-xs text-gray-400">({b.canceladaRazon.replace(/_/g, ' ')})</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-500 capitalize">{b.reservadoPor}</td>
                      <td className="px-5 py-3 text-gray-500">
                        {b.dependentNombreSnapshot ?? alumno.name}
                      </td>
                      <td className="px-5 py-3 text-gray-400 text-xs">
                        {new Date(b.createdAt).toLocaleDateString('es-CL', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Cards mobile */}
          <div className="sm:hidden divide-y divide-gray-100">
            {items.map(b => {
              const estadoInfo = ESTADO_LABEL[b.estado] ?? { label: b.estado, color: 'bg-gray-100 text-gray-500' }
              return (
                <div key={String(b._id)} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-800 text-sm">
                      {new Date(b.fecha).toLocaleDateString('es-CL', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                      <span className="ml-2 text-xs text-gray-400">Sesión #{b.slotIndex + 1}</span>
                    </p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estadoInfo.color}`}>
                      {estadoInfo.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Para: {b.dependentNombreSnapshot ?? alumno.name} · Por: {b.reservadoPor}
                  </p>
                  {b.canceladaRazon && (
                    <p className="text-xs text-gray-400">{b.canceladaRazon.replace(/_/g, ' ')}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
