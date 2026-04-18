'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import ImageUpload from '@/components/ImageUpload'

interface Location { _id: string; nombre: string; comuna: string }
interface Member { _id: string; nombre: string; rol: string }
interface Horario { dia: string; horaInicio: string; horaFin: string }

const TIPOS = ['visual', 'teatro', 'danza', 'musica', 'otro'] as const
const MODALIDADES = ['presencial', 'online', 'hibrido'] as const
const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const

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
  const [form, setForm] = useState({
    titulo: '', descripcion: '', tipo: 'visual', modalidad: 'presencial',
    precio: '', cupoMax: '', locationId: '', instructorId: '', fechaInicio: '', fechaFin: '',
    edadMinima: '', edadMaxima: '',
    horarios: [{ dia: 'lunes', horaInicio: '10:00', horaFin: '12:00' }] as Horario[],
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
        precio: String(workshop.precio), cupoMax: String(workshop.cupoMax),
        locationId: workshop.locationId?._id || workshop.locationId || '',
        instructorId: workshop.instructorId?._id || workshop.instructorId || '',
        fechaInicio: workshop.fechaInicio?.slice(0, 10) || '',
        fechaFin: workshop.fechaFin?.slice(0, 10) || '',
        edadMinima: workshop.edadMinima ? String(workshop.edadMinima) : '',
        edadMaxima: workshop.edadMaxima ? String(workshop.edadMaxima) : '',
        horarios: workshop.horarios?.length ? workshop.horarios : [{ dia: 'lunes', horaInicio: '10:00', horaFin: '12:00' }],
      })
      setImagenes(workshop.imagenes || [])
    }
    setLocations(locsData.data || [])
    setLoading(false)
  }, [accountId, workshopId])

  useEffect(() => { fetchData() }, [fetchData])

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function updateHorario(idx: number, field: string, value: string) {
    setForm((prev) => {
      const horarios = [...prev.horarios]
      horarios[idx] = { ...horarios[idx], [field]: value }
      return { ...prev, horarios }
    })
  }

  function addHorario() {
    setForm((prev) => ({ ...prev, horarios: [...prev.horarios, { dia: 'lunes', horaInicio: '10:00', horaFin: '12:00' }] }))
  }

  function removeHorario(idx: number) {
    setForm((prev) => ({ ...prev, horarios: prev.horarios.filter((_, i) => i !== idx) }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const body = {
      titulo: form.titulo, descripcion: form.descripcion, tipo: form.tipo, modalidad: form.modalidad,
      precio: Number(form.precio), cupoMax: Number(form.cupoMax),
      locationId: form.locationId || undefined,
      instructorId: form.instructorId || undefined,
      imagenes,
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin || undefined, horarios: form.horarios,
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
          <h2 className="font-semibold text-gray-900">Precio y cupos</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-gray-600 mb-1">Precio (CLP)</label>
              <input type="number" required min="0" value={form.precio} onChange={(e) => update('precio', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
            <div><label className="block text-sm text-gray-600 mb-1">Cupo máximo</label>
              <input type="number" required min="1" value={form.cupoMax} onChange={(e) => update('cupoMax', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold text-gray-900">Horarios</h2>
            <button type="button" onClick={addHorario} className="text-sm text-purple-600 hover:underline">+ Agregar</button>
          </div>
          {form.horarios.map((h, idx) => (
            <div key={idx} className="grid grid-cols-4 gap-2 items-end">
              <select value={h.dia} onChange={(e) => updateHorario(idx, 'dia', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm">{DIAS.map((d) => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}</select>
              <input type="time" value={h.horaInicio} onChange={(e) => updateHorario(idx, 'horaInicio', e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <input type="time" value={h.horaFin} onChange={(e) => updateHorario(idx, 'horaFin', e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              {form.horarios.length > 1 && <button type="button" onClick={() => removeHorario(idx)} className="text-red-400 hover:text-red-600 text-sm">✕</button>}
            </div>
          ))}
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
