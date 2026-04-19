'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ImageUpload from '@/components/ImageUpload'
import SlotEditor, { DuracionSelector } from '@/components/SlotEditor'
import AIDescriptionHelper from '@/components/AIDescriptionHelper'
import StockImagePicker from '@/components/StockImagePicker'
import { type SlotData } from '@/components/SlotCalendar'

interface Location { _id: string; nombre: string; comuna: string }
interface Member { _id: string; nombre: string; rol: string }

const TIPOS = ['visual', 'teatro', 'danza', 'musica', 'ceramica', 'yoga', 'cocina', 'manualidades', 'fotografia', 'escritura', 'bienestar', 'tecnologia', 'idiomas', 'infantil', 'otro'] as const
const MODALIDADES = ['presencial', 'online', 'hibrido'] as const

export default function NuevoTallerPage() {
  const router = useRouter()
  const [locations, setLocations] = useState<Location[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [imagenes, setImagenes] = useState<string[]>([])
  const [tipoCuenta, setTipoCuenta] = useState<'individual' | 'institucion'>('individual')
  const [duracionSesion, setDuracionSesion] = useState(90)
  const [cupoDefault, setCupoDefault] = useState(10)
  const [slots, setSlots] = useState<SlotData[]>([])
  const [form, setForm] = useState({
    titulo: '', descripcion: '', tipo: 'visual', modalidad: 'presencial',
    precio: '', locationId: '', instructorId: '', fechaInicio: '',
    fechaFin: '', edadMinima: '', edadMaxima: '',
  })

  const accountId = typeof document !== 'undefined'
    ? document.getElementById('accountId')?.getAttribute('value') || ''
    : ''

  const fetchLocations = useCallback(async () => {
    if (!accountId) return
    const [res, mRes, aRes] = await Promise.all([
      fetch(`/api/locations?accountId=${accountId}`),
      fetch(`/api/accounts/${accountId}/members`),
      fetch(`/api/accounts/${accountId}`),
    ])
    const data = await res.json()
    setLocations(data.data || [])
    if (mRes.ok) {
      const mData = await mRes.json()
      setMembers(mData.filter((m: Member) => m.rol === 'instructor' || m.rol === 'owner'))
    }
    if (aRes.ok) {
      const aData = await aRes.json()
      if (aData.tipo) setTipoCuenta(aData.tipo)
    }
  }, [accountId])

  useEffect(() => { fetchLocations() }, [fetchLocations])

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const body = {
      ...form,
      accountId,
      imagenes,
      precio: Number(form.precio),
      duracionSesion,
      cupoDefault,
      cupoMax: slots.length > 0 ? 1 : cupoDefault,
      slots,
      locationId: form.locationId || undefined,
      instructorId: form.instructorId || undefined,
      edadMinima: form.edadMinima ? Number(form.edadMinima) : undefined,
      edadMaxima: form.edadMaxima ? Number(form.edadMaxima) : undefined,
      fechaFin: form.fechaFin || undefined,
    }

    const res = await fetch('/api/workshops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    setSaving(false)

    if (!res.ok) {
      const text = await res.text()
      try {
        const data = JSON.parse(text)
        setError(data.error || `Error ${res.status}`)
      } catch {
        setError(`Error del servidor (${res.status})`)
      }
      return
    }

    router.push('/dashboard/talleres')
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nuevo taller</h1>

      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Info básica */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Información básica</h2>
          <input required placeholder="Título del taller" value={form.titulo}
            onChange={(e) => update('titulo', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
          <textarea required rows={4} placeholder="Descripción detallada" value={form.descripcion}
            onChange={(e) => update('descripcion', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
          <AIDescriptionHelper titulo={form.titulo} tipo={form.tipo} modalidad={form.modalidad}
            descripcion={form.descripcion} tipoCuenta={tipoCuenta} onApply={(text) => update('descripcion', text)} />
          <div className="grid grid-cols-2 gap-4">
            <select value={form.tipo} onChange={(e) => update('tipo', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
              {TIPOS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
            <select value={form.modalidad} onChange={(e) => update('modalidad', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
              {MODALIDADES.map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
            </select>
          </div>
        </section>

        {/* Precio y configuración */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Precio y configuración</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Precio (CLP)</label>
              <input type="number" required min="0" value={form.precio}
                onChange={(e) => update('precio', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Cupo por defecto</label>
              <input type="number" required min="1" value={cupoDefault}
                onChange={(e) => setCupoDefault(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>
          </div>
          <DuracionSelector value={duracionSesion} onChange={setDuracionSesion} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Edad mínima (opcional)</label>
              <input type="number" min="0" value={form.edadMinima}
                onChange={(e) => update('edadMinima', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Edad máxima (opcional)</label>
              <input type="number" min="0" value={form.edadMaxima}
                onChange={(e) => update('edadMaxima', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>
          </div>
        </section>

        {/* Horarios — SlotEditor */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <SlotEditor slots={slots} duracionSesion={duracionSesion} cupoDefault={cupoDefault} onSlotsChange={setSlots} />
        </section>

        {/* Fechas y ubicación */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Fechas y ubicación</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Fecha inicio</label>
              <input type="date" required value={form.fechaInicio}
                onChange={(e) => update('fechaInicio', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Fecha fin (opcional)</label>
              <input type="date" value={form.fechaFin}
                onChange={(e) => update('fechaFin', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>
          </div>
          {locations.length > 0 && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Ubicación</label>
              <select value={form.locationId} onChange={(e) => update('locationId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                <option value="">Sin ubicación (online)</option>
                {locations.map((l) => (
                  <option key={l._id} value={l._id}>{l.nombre} — {l.comuna}</option>
                ))}
              </select>
            </div>
          )}
          {members.length > 0 && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Instructor (opcional)</label>
              <select value={form.instructorId} onChange={(e) => update('instructorId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                <option value="">Sin asignar</option>
                {members.map((m) => (
                  <option key={m._id} value={m._id}>{m.nombre}</option>
                ))}
              </select>
            </div>
          )}
        </section>

        {/* Imágenes */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <ImageUpload folder="tallerea/workshops" images={imagenes} onChange={setImagenes} max={5} label="Fotos del taller" />
          <StockImagePicker tipo={form.tipo} titulo={form.titulo} currentCount={imagenes.length} max={5}
            onImport={(url) => setImagenes(prev => [...prev, url])} />
        </section>

        <button type="submit" disabled={saving}
          className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition">
          {saving ? 'Publicando...' : 'Publicar taller'}
        </button>
      </form>
    </div>
  )
}
