'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import AIDescriptionHelper from '@/components/AIDescriptionHelper'
import StockImagePicker from '@/components/StockImagePicker'
import ImageUpload from '@/components/ImageUpload'
import EditorPrecios, { type EditorPreciosValue } from '@/components/EditorPrecios'
import SlotCalendar, { type SlotData } from '@/components/SlotCalendar'

const TIPOS = [
  { value: 'visual', label: 'Artes visuales' },
  { value: 'teatro', label: 'Teatro' },
  { value: 'danza', label: 'Danza' },
  { value: 'musica', label: 'Música' },
  { value: 'ceramica', label: 'Cerámica' },
  { value: 'yoga', label: 'Yoga / Bienestar' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'fotografia', label: 'Fotografía' },
  { value: 'escritura', label: 'Escritura' },
  { value: 'manualidades', label: 'Manualidades' },
  { value: 'bienestar', label: 'Bienestar' },
  { value: 'tecnologia', label: 'Tecnología' },
  { value: 'idiomas', label: 'Idiomas' },
  { value: 'infantil', label: 'Infantil' },
  { value: 'otro', label: 'Otro' },
]

interface LocationOption { _id: string; nombre: string; comuna: string }

interface FormData {
  titulo: string
  tipo: string
  modalidad: 'presencial' | 'online' | 'hibrido'
  precio: string
  precioModalidad: 'bruto' | 'neto'
  descripcion: string
  duracionSesion: string
  cupoPorSesion: string
  fechaInicio: string
  horaInicio: string
  locationId: string
  horasAntesCancelacion: string
  permitirReagendamiento: boolean
  imagenes: string[]
  // recurrente
  sesionesIncluidas: string
  vigencia: 'mensual' | 'por_ciclo' | 'sin_vencimiento'
  modeloAcceso: 'puntual' | 'recurrente'
}

export default function EditarTallerPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [form, setForm] = useState<FormData>({
    titulo: '', tipo: '', modalidad: 'presencial', precio: '',
    precioModalidad: 'bruto', descripcion: '', duracionSesion: '90',
    cupoPorSesion: '10', fechaInicio: '', horaInicio: '', locationId: '',
    horasAntesCancelacion: '24', permitirReagendamiento: true,
    imagenes: [],
    sesionesIncluidas: '8', vigencia: 'mensual', modeloAcceso: 'puntual',
  })
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [preciosData, setPreciosData] = useState<EditorPreciosValue>({
    modalidadPrecio: 'fijo',
    precioFijo: { monto: 0 },
  })
  const [comisionPct, setComisionPct] = useState<number>(15)
  const [slots, setSlots] = useState<SlotData[]>([])
  // Plantilla original al cargar — para detectar si cambió antes de regenerar slots
  const [originalPlantilla, setOriginalPlantilla] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  // Cargar taller existente
  useEffect(() => {
    fetch(`/api/workshops/${id}`)
      .then(r => r.json())
      .then(w => {
        if (w.error) { setError(w.error); return }
        const fechaIso = w.fechaInicio ? new Date(w.fechaInicio).toISOString().split('T')[0] : ''
        const horaInicioPuntual = (w.modeloAcceso === 'puntual' && Array.isArray(w.slots) && w.slots[0]?.horaInicio)
          ? String(w.slots[0].horaInicio)
          : ''
        setForm({
          titulo: w.titulo ?? '',
          tipo: w.tipo ?? '',
          modalidad: w.modalidad ?? 'presencial',
          precio: String(w.precio ?? ''),
          precioModalidad: w.precioModalidad ?? 'bruto',
          descripcion: w.descripcion ?? '',
          duracionSesion: String(w.duracionSesion ?? 90),
          cupoPorSesion: String(w.cupoPorSesion ?? 10),
          fechaInicio: fechaIso,
          horaInicio: horaInicioPuntual,
          locationId: w.locationId
          ? (typeof w.locationId === 'object' ? String((w.locationId as { _id?: unknown })._id ?? '') : String(w.locationId))
          : '',
          horasAntesCancelacion: String(w.politica?.horasAntesCancelacion ?? 24),
          permitirReagendamiento: w.politica?.permitirReagendamiento ?? true,
          imagenes: Array.isArray(w.imagenes) ? w.imagenes : [],
          sesionesIncluidas: String(w.plan?.sesionesIncluidas ?? w.plan?.sesionesPorPeriodo ?? 8),
          vigencia: w.plan?.vigencia ?? 'mensual',
          modeloAcceso: w.modeloAcceso ?? (w.plan ? 'recurrente' : 'puntual'),
        })
        // Cargar datos de precios v2
        setPreciosData({
          modalidadPrecio: w.modalidadPrecio ?? (w.precio === 0 ? 'gratuito' : 'fijo'),
          precioModalidad: w.precioModalidad ?? 'bruto',
          precioFijo:       w.precioFijo       ?? (w.precio !== undefined ? { monto: w.precio } : undefined),
          aporteVoluntario: w.aporteVoluntario ?? undefined,
          paquetes:         w.paquetes         ?? undefined,
          clasePrueba:      w.clasePrueba       ?? undefined,
        })
        // Cargar slots existentes — normalizar dia y deduplicar por dia+horaInicio.
        // Slots con fecha específica (sesiones generadas) se colapsan en su patrón semanal.
        if (Array.isArray(w.slots)) {
          const seen = new Set<string>()
          const deduped: SlotData[] = []
          for (const s of w.slots as (SlotData & { fecha?: unknown })[]) {
            const diaNorm = (s.dia ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            const key = `${diaNorm}|${s.horaInicio}`
            if (!seen.has(key)) {
              seen.add(key)
              deduped.push({
                dia: diaNorm,
                horaInicio: s.horaInicio,
                horaFin: s.horaFin,
                cupoMax: s.cupoMax ?? 10,
                cupoDisponible: s.cupoDisponible ?? s.cupoMax ?? 10,
              })
            }
          }
          setSlots(deduped)
          // Guardar plantilla original serializada para comparar al guardar
          setOriginalPlantilla(JSON.stringify(
            deduped.map(s => ({ dia: s.dia, horaInicio: s.horaInicio, horaFin: s.horaFin }))
          ))
        }
        setLoading(false)
      })
      .catch(() => { setError('Error al cargar el taller'); setLoading(false) })

    fetch('/api/locations')
      .then(r => r.json())
      .then(d => setLocations(d.data ?? []))
      .catch(() => {})

    fetch('/api/admin/config')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.comisionPct !== undefined) setComisionPct(d.comisionPct) })
      .catch(() => {})
  }, [id])

  function up<K extends keyof FormData>(k: K, v: FormData[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titulo.trim()) { setError('Escribe el nombre del taller'); return }
    if (!form.descripcion.trim()) { setError('Escribe la descripción'); return }
    if (form.modeloAcceso === 'puntual' && !form.horaInicio) { setError('Selecciona la hora de inicio'); return }

    setSaving(true)
    setError('')
    setOk(false)

    const body: Record<string, unknown> = {
      titulo: form.titulo.trim(),
      tipo: form.tipo,
      modalidad: form.modalidad,
      precio: preciosData.modalidadPrecio === 'fijo' ? (preciosData.precioFijo?.monto ?? 0) : 0,
      precioModalidad: preciosData.precioModalidad ?? form.precioModalidad ?? 'bruto',
      descripcion: form.descripcion.trim(),
      duracionSesion: parseInt(form.duracionSesion) || 90,
      cupoPorSesion: parseInt(form.cupoPorSesion) || 10,
      fechaInicio: form.fechaInicio,
      // Modelo de precios v2
      modalidadPrecio: preciosData.modalidadPrecio,
      ...(preciosData.precioFijo      && { precioFijo:       preciosData.precioFijo }),
      ...(preciosData.aporteVoluntario && { aporteVoluntario: preciosData.aporteVoluntario }),
      ...(preciosData.paquetes        && { paquetes:         preciosData.paquetes }),
      ...(preciosData.clasePrueba     && { clasePrueba:      preciosData.clasePrueba }),
      politica: {
        horasAntesCancelacion: parseInt(form.horasAntesCancelacion) || 24,
        permitirReagendamiento: form.permitirReagendamiento,
      },
    }

    if (form.modeloAcceso === 'recurrente') {
      // Para gratuito recurrente, las sesiones por ciclo vienen del EditorPrecios
      const sesGratuito = preciosData.modalidadPrecio === 'gratuito'
        ? preciosData.sesionesPorPeriodoGratuito
        : undefined
      body.plan = {
        sesionesIncluidas: sesGratuito ?? (parseInt(form.sesionesIncluidas) || 8),
        sesionesPorPeriodo: sesGratuito ?? (parseInt(form.sesionesIncluidas) || 8),
        vigencia: form.vigencia,
        horasAntesCancelacion: parseInt(form.horasAntesCancelacion) || 24,
        permitirCambioPostPlazo: form.permitirReagendamiento,
        politicaNoShow: 'pierde',
        precioSesionSuelta: null,
      }
    }

    if (form.locationId && (form.modalidad === 'presencial' || form.modalidad === 'hibrido')) {
      body.locationId = form.locationId
    } else {
      body.locationId = null
    }

    body.imagenes = form.imagenes

    if (form.modeloAcceso === 'recurrente') {
      // Para recurrente: actualizar plantillaSemanal (no slots directos, para no borrar las
      // instancias generadas con fecha específica que muestra el calendario)
      body.plantillaSemanal = slots.map(s => ({ dia: s.dia, horaInicio: s.horaInicio, horaFin: s.horaFin }))
    } else {
      // Puntual: regenerar slot único con fecha + hora + duración configuradas
      const dur = parseInt(form.duracionSesion) || 90
      const cupoMax = parseInt(form.cupoPorSesion) || 10
      const [hh, mm] = form.horaInicio.split(':').map(Number)
      const finTotal = hh * 60 + mm + dur
      const horaFin = `${String(Math.floor(finTotal / 60) % 24).padStart(2, '0')}:${String(finTotal % 60).padStart(2, '0')}`
      const fechaSlot = new Date(`${form.fechaInicio}T12:00:00.000Z`)
      // Conservar reservas si existían en el slot anterior
      const reservasPrev = (slots[0] as { reservas?: number } | undefined)?.reservas ?? 0
      body.slots = [{
        horaInicio: form.horaInicio,
        horaFin,
        fecha: fechaSlot,
        cupoMax,
        cupoDisponible: Math.max(0, cupoMax - reservasPrev),
        reservas: reservasPrev,
      }]
    }

    const res = await fetch(`/api/workshops/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) { setSaving(false); setError(data.error || 'Error al guardar'); return }

    // Regenerar slots solo si la plantilla semanal cambió efectivamente
    // Esto evita borrar slots futuros sin reservas cuando se guardan otros campos del taller
    if (form.modeloAcceso === 'recurrente') {
      const nuevaPlantilla = JSON.stringify(
        slots.map(s => ({ dia: s.dia, horaInicio: s.horaInicio, horaFin: s.horaFin }))
      )
      if (nuevaPlantilla !== originalPlantilla) {
        await fetch(`/api/workshops/${id}/generate-slots`, { method: 'POST' }).catch(() => null)
        setOriginalPlantilla(nuevaPlantilla)
      }
    }

    setSaving(false)
    setOk(true)
    router.refresh()
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Cargando taller…</div>

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/tallerista/talleres" className="text-sm text-gray-500 hover:text-gray-700">← Volver</Link>
        <h1 className="text-2xl font-bold text-gray-900">Editar taller</h1>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-6">{error}</div>}
      {ok && <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-6">Cambios guardados ✓</div>}

      <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-xl border border-gray-200 p-6">

        {/* Nombre */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del taller</label>
          <input required value={form.titulo} onChange={e => up('titulo', e.target.value)} maxLength={150}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
            placeholder="Ej: Cerámica para principiantes" />
        </div>

        {/* Categoría + Modalidad */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <select required value={form.tipo} onChange={e => up('tipo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500">
              <option value="">Seleccionar…</option>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Modalidad</label>
            <select value={form.modalidad} onChange={e => up('modalidad', e.target.value as FormData['modalidad'])}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500">
              <option value="presencial">Presencial</option>
              <option value="online">Online</option>
              <option value="hibrido">Híbrido</option>
            </select>
          </div>
        </div>

        {/* Editor de precios v2 */}
        <EditorPrecios
          value={preciosData}
          onChange={setPreciosData}
          modeloAcceso={form.modeloAcceso}
          comisionPct={comisionPct}
        />

        {/* Descripción */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Descripción <span className="text-gray-400 text-xs">({form.descripcion.length}/2000)</span>
          </label>
          <textarea required rows={4} value={form.descripcion} onChange={e => up('descripcion', e.target.value)} maxLength={2000}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" />
          <div className="mt-2">
            <AIDescriptionHelper
              titulo={form.titulo} tipo={form.tipo} modalidad={form.modalidad}
              descripcion={form.descripcion}
              onApply={text => up('descripcion', text)}
            />
          </div>
        </div>

        {/* Fotos del taller */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Fotos del taller</label>
          <ImageUpload
            folder="tallerea/workshops"
            images={form.imagenes}
            onChange={imgs => up('imagenes', imgs)}
            max={5}
            label="Subir fotos"
          />
          <StockImagePicker
            tipo={form.tipo}
            titulo={form.titulo}
            currentCount={form.imagenes.length}
            max={5}
            onImport={url => up('imagenes', [...form.imagenes, url])}
          />
        </div>

        {/* Espacio — presencial/híbrido */}
        {(form.modalidad === 'presencial' || form.modalidad === 'hibrido') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Espacio / ubicación</label>
            {locations.length === 0 ? (
              <p className="text-sm text-gray-500">No tienes espacios. <Link href="/tallerista/espacios" className="text-purple-600 hover:underline">Crear espacio</Link></p>
            ) : (
              <select value={form.locationId} onChange={e => up('locationId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500">
                <option value="">Sin espacio asignado</option>
                {locations.map(l => <option key={l._id} value={l._id}>{l.nombre} — {l.comuna}</option>)}
              </select>
            )}
          </div>
        )}

        {/* Horarios de clase — solo recurrente */}
        {form.modeloAcceso === 'recurrente' && (
          <div className="border-t pt-4 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Horario semanal (patrón)</h3>
              <p className="text-xs text-gray-500 mb-3">Define los días y horarios que se repiten cada semana.</p>
            <SlotCalendar
              slots={slots}
              duracionSesion={parseInt(form.duracionSesion) || 90}
              cupoDefault={parseInt(form.cupoPorSesion) || 10}
              onSlotsChange={setSlots}
            />
            <a
              href={`/tallerista/calendario?workshop=${id}`}
              className="inline-flex items-center gap-1 mt-3 text-xs text-purple-700 hover:text-purple-900 hover:underline"
            >
              Ver y gestionar sesiones programadas →
            </a>
          </div>
          </div>
        )}

        {/* Duración + cupo + fecha */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duración (min)</label>
            <input type="number" min="30" max="480" step="15" value={form.duracionSesion} onChange={e => up('duracionSesion', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cupo</label>
            <input type="number" min="1" max="100" value={form.cupoPorSesion} onChange={e => up('cupoPorSesion', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio</label>
            <input type="date" value={form.fechaInicio} onChange={e => up('fechaInicio', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" />
          </div>
        </div>

        {form.modeloAcceso === 'puntual' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hora de inicio</label>
            <input type="time" value={form.horaInicio} onChange={e => up('horaInicio', e.target.value)}
              className="w-full sm:w-1/3 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" />
            <p className="text-xs text-gray-500 mt-1">La hora de término se calcula automáticamente según la duración.</p>
          </div>
        )}

        {/* Política */}
        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Política de cancelación</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Horas mínimas previas</label>
              <input type="number" min="0" value={form.horasAntesCancelacion} onChange={e => up('horasAntesCancelacion', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="reagendar" checked={form.permitirReagendamiento}
                onChange={e => up('permitirReagendamiento', e.target.checked)}
                className="w-4 h-4 accent-purple-600" />
              <label htmlFor="reagendar" className="text-sm text-gray-700">Permitir reagendamiento</label>
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 rounded-lg disabled:opacity-50 transition-colors">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  )
}
