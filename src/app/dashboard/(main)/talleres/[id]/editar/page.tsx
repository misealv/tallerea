'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import ImageUpload from '@/components/ImageUpload'
import SlotEditor, { DuracionSelector } from '@/components/SlotEditor'
import { type SlotData } from '@/components/SlotCalendar'

interface Location { _id: string; nombre: string; comuna: string }
interface Member { _id: string; nombre: string; rol: string }

const TIPOS = ['visual', 'teatro', 'danza', 'musica', 'otro'] as const
const MODALIDADES = ['presencial', 'online', 'hibrido'] as const

export default function EditarTallerPage() {
  const router = useRouter()
  const params = useParams()
  const workshopId = params.id as string
  const [locations, setLocations] = useState<Location[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [imagenes, setImagenes] = useState<string[]>([])
  const [duracionSesion, setDuracionSesion] = useState(90)
  const [cupoDefault, setCupoDefault] = useState(10)
  const [slots, setSlots] = useState<SlotData[]>([])
  const [form, setForm] = useState({
    titulo: '', descripcion: '', tipo: 'visual', modalidad: 'presencial',
    precio: '', locationId: '', instructorId: '', fechaInicio: '', fechaFin: '',
    edadMinima: '', edadMaxima: '',
  })

  const accountId = typeof document !== 'undefined'
    ? document.getElementById('accountId')?.getAttribute('value') || ''
    : ''

  const fetchData = useCallback(async () => {
    if (!accountId) return
    const [wRes, lRes, mRes] = await Promise.all([
      fetch(`/api/workshops/${workshopId}`),
      fetch(`/api/locations?accountId=${accountId}`),
      fetch(`/api/accounts/${accountId}/members`),
    ])
    const [workshop, locsData] = await Promise.all([wRes.json(), lRes.json()])
    if (mRes.ok) {
      const mData = await mRes.json()
      setMembers(mData.filter((m: Member) => m.rol === 'instructor' || m.rol === 'owner'))
    }

    if (wRes.ok && workshop) {
      setForm({
        titulo: workshop.titulo, descripcion: workshop.descripcion,
        tipo: workshop.tipo, modalidad: workshop.modalidad,
        precio: String(workshop.precio),
        locationId: workshop.locationId?._id || workshop.locationId || '',
        instructorId: workshop.instructorId?._id || workshop.instructorId || '',
        fechaInicio: workshop.fechaInicio?.slice(0, 10) || '',
        fechaFin: workshop.fechaFin?.slice(0, 10) || '',
        edadMinima: workshop.edadMinima ? String(workshop.edadMinima) : '',
        edadMaxima: workshop.edadMaxima ? String(workshop.edadMaxima) : '',
      })
      setDuracionSesion(workshop.duracionSesion || 90)
      setCupoDefault(workshop.cupoDefault || 10)
      setSlots(workshop.slots || [])
      setImagenes(workshop.imagenes || [])
    }
    setLocations(locsData.data || [])
    setLoading(false)
  }, [accountId, workshopId])

  useEffect(() => { fetchData() }, [fetchData])

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const body = {
      titulo: form.titulo, descripcion: form.descripcion, tipo: form.tipo, modalidad: form.modalidad,
      precio: Number(form.precio), duracionSesion, cupoDefault,
      cupoMax: slots.length > 0 ? 1 : cupoDefault,
      slots,
      locationId: form.locationId || undefined,
      instructorId: form.instructorId || undefined,
      imagenes,
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin || undefined,
      edadMinima: form.edadMinima ? Number(form.edadMinima) : undefined,
      edadMaxima: form.edadMaxima ? Number(form.edadMaxima) : undefined,
    }

    const res = await fetch(`/api/workshops/${workshopId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error || 'Error al actualizar')
      return
    }
    router.push('/dashboard/talleres')
  }

  if (loading) return <div className="text-gray-500">Cargando taller...</div>

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Editar taller</h1>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Información básica</h2>
          <input required value={form.titulo} onChange={(e) => update('titulo', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
          <textarea required rows={4} value={form.descripcion} onChange={(e) => update('descripcion', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
          <div className="grid grid-cols-2 gap-4">
            <select value={form.tipo} onChange={(e) => update('tipo', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg">{TIPOS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}</select>
            <select value={form.modalidad} onChange={(e) => update('modalidad', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg">{MODALIDADES.map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}</select>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Precio y configuración</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-gray-600 mb-1">Precio (CLP)</label>
              <input type="number" required min="0" value={form.precio} onChange={(e) => update('precio', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
            <div><label className="block text-sm text-gray-600 mb-1">Cupo por defecto</label>
              <input type="number" required min="1" value={cupoDefault}
                onChange={(e) => setCupoDefault(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
          </div>
          <DuracionSelector value={duracionSesion} onChange={setDuracionSesion} />
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <SlotEditor slots={slots} duracionSesion={duracionSesion} cupoDefault={cupoDefault} onSlotsChange={setSlots} />
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Fechas y ubicación</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-gray-600 mb-1">Fecha inicio</label>
              <input type="date" required value={form.fechaInicio} onChange={(e) => update('fechaInicio', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
            <div><label className="block text-sm text-gray-600 mb-1">Fecha fin (opcional)</label>
              <input type="date" value={form.fechaFin} onChange={(e) => update('fechaFin', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
          </div>
          {locations.length > 0 && (
            <select value={form.locationId} onChange={(e) => update('locationId', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"><option value="">Sin ubicación</option>
              {locations.map((l) => <option key={l._id} value={l._id}>{l.nombre} — {l.comuna}</option>)}</select>
          )}
          {members.length > 0 && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Instructor (opcional)</label>
              <select value={form.instructorId} onChange={(e) => update('instructorId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value="">Sin asignar</option>
                {members.map((m) => <option key={m._id} value={m._id}>{m.nombre}</option>)}
              </select>
            </div>
          )}
        </section>

        {/* Imágenes */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <ImageUpload folder="tallerea/workshops" images={imagenes} onChange={setImagenes} max={5} label="Fotos del taller" />
        </section>

        <button type="submit" disabled={saving}
          className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  )
}
