'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface SlotOption { index: number; label: string; cupoDisponible: number }
interface WorkshopInfo {
  _id: string
  titulo: string
  modeloAcceso: 'puntual' | 'recurrente'
  slots: { horaInicio: string; horaFin: string; fecha?: string; cupoDisponible: number; cancelado?: boolean }[]
  precioFijo?: { monto: number }
  precio?: number
}

export default function InscribirAlumnoPage() {
  const { id: workshopId } = useParams<{ id: string }>()
  const router = useRouter()

  const [workshop, setWorkshop]   = useState<WorkshopInfo | null>(null)
  const [loading, setLoading]     = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')

  // Campos del formulario
  const [email, setEmail]           = useState('')
  const [nombre, setNombre]         = useState('')
  const [slotIndex, setSlotIndex]   = useState<number | null>(null)
  const [montoPagado, setMontoPagado] = useState(0)
  const [nota, setNota]             = useState('')

  // Dependiente
  const [tieneDep, setTieneDep]         = useState(false)
  const [depNombre, setDepNombre]       = useState('')
  const [depFechaNac, setDepFechaNac]   = useState('')
  const [depNotas, setDepNotas]         = useState('')

  // Recurrente
  const [precioEspecial, setPrecioEspecial] = useState(false)
  const [precioSnapshot, setPrecioSnapshot] = useState('')
  const [notaPrecio, setNotaPrecio]         = useState('')
  const [tienePrepagado, setTienePrepagado] = useState(false)
  const [prepCantidad, setPrepCantidad]     = useState(1)
  const [prepFechaPago, setPrepFechaPago]   = useState(new Date().toISOString().slice(0, 10))
  const [prepMetodo, setPrepMetodo]         = useState('transferencia')
  const [prepMonto, setPrepMonto]           = useState('')
  const [prepNota, setPrepNota]             = useState('')

  useEffect(() => {
    fetch(`/api/tallerista/inscripciones-manuales/workshop-info?id=${workshopId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return }
        setWorkshop(data)
        setMontoPagado(data.precioFijo?.monto ?? data.precio ?? 0)
        setLoading(false)
      })
      .catch(() => { setError('No se pudo cargar el taller'); setLoading(false) })
  }, [workshopId])

  const slotOptions: SlotOption[] = workshop?.slots.flatMap((s, i) =>
    s.cancelado ? [] : [{
      index: i,
      label: s.fecha
        ? `${new Date(s.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })} ${s.horaInicio}`
        : `${s.horaInicio} – ${s.horaFin}`,
      cupoDisponible: s.cupoDisponible,
    }]
  ) ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!workshop) return
    if (!email.trim() || !nombre.trim()) { setError('Email y nombre son obligatorios'); return }
    if (tieneDep && !depNombre.trim()) { setError('Nombre del dependiente es obligatorio'); return }
    if (workshop.modeloAcceso === 'puntual' && slotIndex === null && workshop.slots.length > 0) {
      setError('Selecciona una sesión'); return
    }
    if (precioEspecial && !precioSnapshot.trim()) { setError('Precio especial es obligatorio'); return }

    const body: Record<string, unknown> = {
      workshopId,
      studentEmail:  email.trim().toLowerCase(),
      studentNombre: nombre.trim(),
      notaTallerista: nota.trim() || undefined,
      ...(tieneDep ? {
        dependentNombre: depNombre.trim(),
        dependentFechaNacimiento: depFechaNac || undefined,
        dependentNotas: depNotas.trim() || undefined,
      } : {}),
    }

    if (workshop.modeloAcceso === 'puntual') {
      body.tipo = 'puntual'
      body.slotIndex = slotIndex
      body.montoPagado = Number(montoPagado)
    } else {
      body.tipo = 'recurrente'
      body.precioEspecial = precioEspecial
      if (precioEspecial) body.precioSnapshot = Number(precioSnapshot)
      if (notaPrecio.trim()) body.notaPrecioEspecial = notaPrecio.trim()
      if (tienePrepagado) {
        body.clasesPrepagadas = {
          cantidad:       prepCantidad,
          fechaPago:      prepFechaPago,
          metodoPago:     prepMetodo.trim(),
          montoDeclarado: prepMonto ? Number(prepMonto) : undefined,
          notaTallerista: prepNota.trim() || undefined,
        }
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/tallerista/inscripciones-manuales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al inscribir'); return }
      setSuccess('¡Alumno inscrito correctamente! Se le envió un acceso por email.')
      setTimeout(() => router.push(`/tallerista/talleres/${workshopId}/inscritos`), 2000)
    } catch {
      setError('Error de red. Intenta nuevamente.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-500">Cargando taller…</div>

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/tallerista/talleres/${workshopId}/inscritos`} className="text-indigo-600 hover:underline text-sm">
          ← Inscritos
        </Link>
        <h1 className="text-xl font-semibold text-gray-800">
          Inscribir alumno — <span className="text-indigo-600">{workshop?.titulo}</span>
        </h1>
      </div>

      {success && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-green-700 text-sm">
          {success}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">

        {/* Datos del alumno */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-gray-700 mb-1">Datos del alumno</legend>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email *</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="alumno@email.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nombre completo *</label>
            <input type="text" required value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="María González"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
        </fieldset>

        {/* Dependiente */}
        <fieldset className="space-y-3">
          <div className="flex items-center gap-2">
            <input type="checkbox" id="tieneDep" checked={tieneDep} onChange={e => setTieneDep(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600" />
            <label htmlFor="tieneDep" className="text-sm text-gray-700">El alumno inscribe a un menor / dependiente</label>
          </div>
          {tieneDep && (
            <div className="pl-5 space-y-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nombre del menor *</label>
                <input type="text" required={tieneDep} value={depNombre} onChange={e => setDepNombre(e.target.value)}
                  placeholder="Nombre del menor"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fecha de nacimiento (opcional)</label>
                <input type="date" value={depFechaNac} onChange={e => setDepFechaNac(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notas sobre el menor (opcional)</label>
                <input type="text" value={depNotas} onChange={e => setDepNotas(e.target.value)}
                  placeholder="Alergias, necesidades especiales…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>
          )}
        </fieldset>

        {/* Campos según modeloAcceso */}
        {workshop?.modeloAcceso === 'puntual' && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-gray-700 mb-1">Sesión y pago</legend>
            {slotOptions.length > 0 && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Sesión *</label>
                <select value={slotIndex ?? ''} onChange={e => setSlotIndex(e.target.value === '' ? null : Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">Selecciona una sesión…</option>
                  {slotOptions.map(s => (
                    <option key={s.index} value={s.index} disabled={s.cupoDisponible <= 0}>
                      {s.label}{s.cupoDisponible <= 0 ? ' (sin cupo)' : ` (${s.cupoDisponible} cupos)`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Monto cobrado (CLP)</label>
              <input type="number" min={0} step={1} value={montoPagado} onChange={e => setMontoPagado(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <p className="text-xs text-gray-400 mt-1">Puede ser $0 si es gratuito o acuerdo especial.</p>
            </div>
          </fieldset>
        )}

        {workshop?.modeloAcceso === 'recurrente' && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-gray-700 mb-1">Suscripción</legend>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="precioEsp" checked={precioEspecial} onChange={e => setPrecioEspecial(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600" />
              <label htmlFor="precioEsp" className="text-sm text-gray-700">Precio especial (distinto al publicado)</label>
            </div>
            {precioEspecial && (
              <div className="pl-5 space-y-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Precio acordado (CLP) *</label>
                  <input type="number" min={0} step={1} required={precioEspecial} value={precioSnapshot}
                    onChange={e => setPrecioSnapshot(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Motivo del precio especial (opcional)</label>
                  <input type="text" value={notaPrecio} onChange={e => setNotaPrecio(e.target.value)}
                    placeholder="Ej: hermana de alumna actual"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input type="checkbox" id="tienePrepagado" checked={tienePrepagado} onChange={e => setTienePrepagado(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600" />
              <label htmlFor="tienePrepagado" className="text-sm text-gray-700">Registrar clases prepagadas</label>
            </div>
            {tienePrepagado && (
              <div className="pl-5 space-y-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cantidad de clases *</label>
                  <input type="number" min={1} step={1} required={tienePrepagado} value={prepCantidad}
                    onChange={e => setPrepCantidad(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fecha de pago *</label>
                  <input type="date" required={tienePrepagado} value={prepFechaPago} onChange={e => setPrepFechaPago(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Método de pago *</label>
                  <select value={prepMetodo} onChange={e => setPrepMetodo(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="transferencia">Transferencia bancaria</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="mercadopago">MercadoPago</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Monto declarado (CLP, opcional)</label>
                  <input type="number" min={0} step={1} value={prepMonto} onChange={e => setPrepMonto(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nota del prepago (opcional)</label>
                  <input type="text" value={prepNota} onChange={e => setPrepNota(e.target.value)}
                    placeholder="Ej: pago de marzo + abril"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>
            )}
          </fieldset>
        )}

        {/* Nota general */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nota interna (visible solo para ti)</label>
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
            placeholder="Ej: alumna referida por María"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
        </div>

        <button type="submit" disabled={submitting}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {submitting ? 'Inscribiendo…' : 'Inscribir alumno'}
        </button>
      </form>
    </div>
  )
}
