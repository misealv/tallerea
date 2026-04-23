import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import dbConnect from '@/lib/db'
import Booking from '@/models/Booking'
import Workshop from '@/models/Workshop'
import { Types } from 'mongoose'
import DecideReagendamientoButton from '@/components/DecideReagendamientoButton'

export const dynamic = 'force-dynamic'

interface StudentRef { name: string; email: string }
interface WorkshopRef { _id: Types.ObjectId; titulo: string; ownerId?: Types.ObjectId; accountId?: Types.ObjectId; slots: { horaInicio: string; horaFin: string }[] }
interface BookingLean {
  _id: Types.ObjectId
  workshopId: WorkshopRef
  studentId: StudentRef
  slotIndex: number
  fecha: Date
  reagendamiento: { solicitadoEn: Date; estado: string; slotDestinoIndex?: number }
}

export default async function ReagendamientosPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  await dbConnect()
  const ownerId = session.user.id

  // Obtener IDs de talleres propios
  const misWorkshops = await Workshop.find({
    $or: [{ ownerId }, { accountId: ownerId }],
    activo: true,
    deletedAt: null,
  }).select('_id').lean<{ _id: Types.ObjectId }[]>()

  const workshopIds = misWorkshops.map(w => w._id)

  const pendientes = await Booking.find({
    workshopId: { $in: workshopIds },
    'reagendamiento.estado': 'pendiente',
    activo: true,
  })
    .populate('workshopId', 'titulo ownerId accountId slots')
    .populate('studentId', 'name email')
    .sort({ 'reagendamiento.solicitadoEn': 1 })
    .lean<BookingLean[]>()

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reagendamientos</h1>
        <p className="text-sm text-gray-500 mt-1">
          {pendientes.length === 0
            ? 'Sin solicitudes pendientes.'
            : `${pendientes.length} solicitud${pendientes.length !== 1 ? 'es' : ''} pendiente${pendientes.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {pendientes.length === 0 ? (
        <div className="bg-gray-50 rounded-xl px-6 py-10 text-center text-gray-400 text-sm">
          Cuando un alumno solicite cambiar de sesión, aparecerá aquí.
        </div>
      ) : (
        <div className="space-y-4">
          {pendientes.map(b => {
            const workshop = b.workshopId as WorkshopRef
            const slotActual = workshop.slots[b.slotIndex]
            const slotDestino = b.reagendamiento.slotDestinoIndex !== undefined
              ? workshop.slots[b.reagendamiento.slotDestinoIndex]
              : null

            return (
              <div key={String(b._id)} className="bg-white border border-gray-200 rounded-xl px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-medium text-gray-900 text-sm">{workshop.titulo}</p>
                    <p className="text-xs text-gray-500">
                      Alumno: <span className="font-medium text-gray-700">{(b.studentId as StudentRef).name}</span>
                      {' — '}{(b.studentId as StudentRef).email}
                    </p>
                    <p className="text-xs text-gray-500">
                      Sesión actual:{' '}
                      {slotActual ? `${slotActual.horaInicio}–${slotActual.horaFin}` : `#${b.slotIndex + 1}`}
                      {' · '}{new Date(b.fecha).toLocaleDateString('es-CL')}
                    </p>
                    {slotDestino && (
                      <p className="text-xs text-indigo-600 font-medium">
                        Solicita cambiar a: {slotDestino.horaInicio}–{slotDestino.horaFin}
                        {' · sesión #'}{(b.reagendamiento.slotDestinoIndex ?? 0) + 1}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">
                      Solicitado el {new Date(b.reagendamiento.solicitadoEn).toLocaleDateString('es-CL')}
                    </p>
                  </div>
                  <DecideReagendamientoButton bookingId={String(b._id)} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
