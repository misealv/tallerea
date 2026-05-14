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

// Datos de un dependiente en el formulario
interface DepForm {
  nombre: string
  fechaNacimiento: string
  notas: string
  precioEspecial: boolean
  precioSnapshot: string
  notaPrecioEspecial: string
  tienePrepagado: boolean
  prepCantidad: number
  prepConsumidas: number
  prepFechaPago: string
  prepMetodo: string
  prepMonto: string
  prepNota: string
  prepCaducaEn: string
}

function emptyDep(): DepForm {
  return {
    nombre: '', fechaNacimiento: '', notas: '',
    precioEspecial: false, precioSnapshot: '', notaPrecioEspecial: '',
    tienePrepagado: false,
    prepCantidad: 4, prepConsumidas: 0,
    prepFechaPago: new Date().toISOString().slice(0, 10),
    prepMetodo: 'transferencia', prepMonto: '', prepNota: '', prepCaducaEn: '',
  }
}

export default function InscribirAlumnoPage() {
  const { id: workshopId } = useParams<{ id: string }>()
  const router = useRouter()

  const [workshop, setWorkshop]     = useState<WorkshopInfo | null>(null)
  const [loading, setLoading]       = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')

  // Datos del apoderado / titular
  const [email, setEmail]   = useState('')
  const [nombre, setNombre] = useState('')
  const [nota, setNota]     = useState('')

  // Puntual: campos adicionales
  const [slotIndex, setSlotIndex]     = useState<number | null>(null)
  const [montoPagado, setMontoPagado] = useState(0)

  // Recurrente: lista de dependientes (al menos 1)
  const [deps, setDeps] = useState<DepForm[]>([emptyDep()])

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

  // Helpers para actualizar un campo de un dependiente por índice
  function setDep<K extends keyof DepForm>(idx: number, key: K, val: DepForm[K]) {
    setDeps(prev => prev.map((d, i) => i === idx ? { ...d, [key]: val } : d))
  }
  function addDep() { setDeps(prev => [...prev, emptyDep()]) }
  function removeDep(idx: number) { setDeps(prev => prev.filter((_, i) => i !== idx)) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!workshop) return
    if (!email.trim() || !nombre.trim()) { setError('Email y nombre son obligatorios'); return }

    if (workshop.modeloAcceso === 'puntual') {
      // --- Puntual (flujo original, único dependiente opcional) ---
      const dep = deps[0]
      if (slotIndex === null && workshop.slots.length > 0) { setError('Selecciona una sesión'); return }

      const body: Record<string, unknown> = {
        workshopId,
        studentEmail:  email.trim().toLowerCase(),
        studentNombre: nombre.trim(),
        tipo: 'puntual',
        slotIndex,
        montoPagado: Number(montoPagado),
        notaTallerista: nota.trim() || undefined,
        ...(dep.nombre.trim() ? {
          dependentNombre: dep.nombre.trim(),
          dependentFechaNacimiento: dep.fechaNacimiento || undefined,
          dependentNotas: dep.notas.trim() || undefined,
        } : {}),
      }
      await submit(body)

    } else {
      // --- Recurrente multi-dependiente ---
      for (let i = 0; i < deps.length; i++) {
        const dep = deps[i]
        if (!dep.nombre.trim()) { setError(`El menor #${i + 1} necesita un nombre`); return }
        if (dep.precioEspecial && !dep.precioSnapshot.trim()) { setError(`El menor #${i + 1} tiene precio especial pero falta el monto`); return }
      }

      const body: Record<string, unknown> = {
        workshopId,
        studentEmail:  email.trim().toLowerCase(),
        studentNombre: nombre.trim(),
        tipo: 'recurrente',
        notaTallerista: nota.trim() || undefined,
        dependientes: deps.map(dep => ({
          nombre: dep.nombre.trim(),
          fechaNacimiento: dep.fechaNacimiento || undefined,
          notas: dep.notas.trim() || undefined,
          precioEspecial: dep.precioEspecial,
          precioSnapshot: dep.precioEspecial ? Number(dep.precioSnapshot) : undefined,
          notaPrecioEspecial: dep.notaPrecioEspecial.trim() || undefined,
          clasesPrepagadas: dep.tienePrepagado ? {
            cantidad:              dep.prepCantidad,
            consumidasAlInscribir: dep.prepConsumidas > 0 ? dep.prepConsumidas : undefined,
            fechaPago:             dep.prepFechaPago,
            metodoPago:            dep.prepMetodo,
            montoDeclarado: dep.prepMonto ? Number(dep.prepMonto) : undefined,
            notaTallerista: dep.prepNota.trim() || undefined,
            caducaEn:       dep.prepCaducaEn ? new Date(dep.prepCaducaEn).toISOString() : undefined,
          } : undefined,
        })),
      }
      await submit(body)
    }
  }

  async function submit(body: Record<string, unknown>) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/tallerista/inscripciones-manuales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok && res.status !== 207) {
        setError(data.error ?? 'Error al inscribir')
        return
      }
      // Caso multi-dependiente: mostrar resultado por cada uno
      if (data.resultados) {
        const fallos = (data.resultados as Array<{ nombre: string; ok: boolean; error?: string }>).filter(r => !r.ok)
        if (fallos.length === 0) {
          setSuccess('¡Todos los menores inscritos correctamente! Se envió acceso por email.')
          setTimeout(() => router.push(`/tallerista/talleres/${workshopId}/inscritos`), 2500)
        } else {
          const exitos = (data.resultados as Array<{ nombre: string; ok: boolean }>).filter(r => r.ok)
          setSuccess(exitos.length > 0 ? `Inscrito(s): ${exitos.map((r: { nombre: string }) => r.nombre).join(', ')}` : '')
          setError(`Error en: ${fallos.map(r => `${r.nombre} (${r.error})`).join(' · ')}`)
        }
        return
      }
      setSuccess('¡Alumno inscrito correctamente! Se le envió un acceso por email.')
      setTimeout(() => router.push(`/tallerista/talleres/${workshopId}/inscritos`), 2000)
    } catch {
      setError('Error de red. Intenta nuevamente.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-500">Cargando taller…</div>

  const isRecurrente = workshop?.modeloAcceso === 'recurrente'

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

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Datos del apoderado / titular */}
        <fieldset className="space-y-3 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <legend className="text-sm font-semibold text-gray-700">Apoderado / titular de la cuenta</legend>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email *</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="apoderado@email.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nombre completo *</label>
            <input type="text" required value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Belén Opaso"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
        </fieldset>

        {/* Puntual: sesión + precio + un dependiente opcional */}
        {!isRecurrente && (
          <fieldset className="space-y-3 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <legend className="text-sm font-semibold text-gray-700">Sesión y pago</legend>
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
            </div>
            {/* Dependiente único para puntual */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nombre del menor (si aplica)</label>
              <input type="text" value={deps[0].nombre} onChange={e => setDep(0, 'nombre', e.target.value)}
                placeholder="Nombre del menor"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </fieldset>
        )}

        {/* Recurrente: lista dinámica de menores */}
        {isRecurrente && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Cada menor tendrá su propia suscripción independiente bajo el mismo apoderado.
            </p>
            {deps.map((dep, idx) => (
              <DepCard
                key={idx}
                idx={idx}
                dep={dep}
                total={deps.length}
                onChange={(key, val) => setDep(idx, key, val)}
                onRemove={() => removeDep(idx)}
              />
            ))}
            {deps.length < 10 && (
              <button type="button" onClick={addDep}
                className="w-full rounded-lg border-2 border-dashed border-indigo-300 px-4 py-2.5 text-sm text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50 transition-colors">
                + Agregar otro menor
              </button>
            )}
          </div>
        )}

        {/* Nota general */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <label className="block text-xs text-gray-500 mb-1">Nota interna (visible solo para ti)</label>
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
            placeholder="Ej: familia referida por María"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
        </div>

        <button type="submit" disabled={submitting}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {submitting
            ? 'Inscribiendo…'
            : isRecurrente && deps.length > 1
              ? `Inscribir ${deps.length} menores`
              : 'Inscribir alumno'}
        </button>
      </form>
    </div>
  )
}

// --- Componente card por menor (recurrente) ---
function DepCard({
  idx, dep, total, onChange, onRemove,
}: {
  idx: number
  dep: DepForm
  total: number
  onChange: <K extends keyof DepForm>(key: K, val: DepForm[K]) => void
  onRemove: () => void
}) {
  return (
    <fieldset className="space-y-3 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <legend className="text-sm font-semibold text-gray-700">
          Menor {idx + 1}
        </legend>
        {total > 1 && (
          <button type="button" onClick={onRemove}
            className="text-xs text-red-500 hover:text-red-700">
            Eliminar
          </button>
        )}
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Nombre del menor *</label>
        <input type="text" required value={dep.nombre} onChange={e => onChange('nombre', e.target.value)}
          placeholder="Nombre del menor"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Fecha de nacimiento</label>
          <input type="date" value={dep.fechaNacimiento} onChange={e => onChange('fechaNacimiento', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Notas</label>
          <input type="text" value={dep.notas} onChange={e => onChange('notas', e.target.value)}
            placeholder="Alergias, etc."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
      </div>

      {/* Precio especial */}
      <div className="flex items-center gap-2">
        <input type="checkbox" id={`precioEsp-${idx}`} checked={dep.precioEspecial}
          onChange={e => onChange('precioEspecial', e.target.checked)}
          className="rounded border-gray-300 text-indigo-600" />
        <label htmlFor={`precioEsp-${idx}`} className="text-sm text-gray-700">Precio especial</label>
      </div>
      {dep.precioEspecial && (
        <div className="pl-5 space-y-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Precio acordado (CLP) *</label>
            <input type="number" min={0} step={1} required value={dep.precioSnapshot}
              onChange={e => onChange('precioSnapshot', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Motivo (opcional)</label>
            <input type="text" value={dep.notaPrecioEspecial}
              onChange={e => onChange('notaPrecioEspecial', e.target.value)}
              placeholder="Ej: hermanos inscritos juntos"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
        </div>
      )}

      {/* Clases prepagadas */}
      <div className="flex items-center gap-2">
        <input type="checkbox" id={`prepagado-${idx}`} checked={dep.tienePrepagado}
          onChange={e => onChange('tienePrepagado', e.target.checked)}
          className="rounded border-gray-300 text-indigo-600" />
        <label htmlFor={`prepagado-${idx}`} className="text-sm text-gray-700">Registrar clases prepagadas</label>
      </div>
      {dep.tienePrepagado && (
        <div className="pl-5 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Clases del paquete *</label>
              <input type="number" min={1} step={1} required value={dep.prepCantidad}
                onChange={e => { onChange('prepCantidad', Number(e.target.value)); if (dep.prepConsumidas >= Number(e.target.value)) onChange('prepConsumidas', 0) }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ya consumidas fuera</label>
              <input type="number" min={0} max={dep.prepCantidad - 1} step={1} value={dep.prepConsumidas}
                onChange={e => onChange('prepConsumidas', Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>
          {dep.prepConsumidas > 0 && (
            <p className="text-xs text-indigo-600">Saldo activo: {dep.prepCantidad - dep.prepConsumidas} de {dep.prepCantidad} clases</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fecha de pago *</label>
              <input type="date" required value={dep.prepFechaPago} onChange={e => onChange('prepFechaPago', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Método *</label>
              <select value={dep.prepMetodo} onChange={e => onChange('prepMetodo', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
                <option value="mercadopago">MercadoPago</option>
                <option value="otro">Otro</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Monto declarado (CLP)</label>
              <input type="number" min={0} step={1} value={dep.prepMonto}
                onChange={e => onChange('prepMonto', e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Caduca el</label>
              <input type="date" value={dep.prepCaducaEn} onChange={e => onChange('prepCaducaEn', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nota del prepago</label>
            <input type="text" value={dep.prepNota} onChange={e => onChange('prepNota', e.target.value)}
              placeholder="Ej: pago mes mayo"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
        </div>
      )}
    </fieldset>
  )
}

