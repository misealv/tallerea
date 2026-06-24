'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface WorkshopOption {
  _id: string
  titulo: string
}

interface ManualPaymentFormProps {
  workshops: WorkshopOption[]
  /** Callback cuando el registro fue creado con éxito */
  onSuccess?: () => void
}

export default function ManualPaymentForm({ workshops, onSuccess }: ManualPaymentFormProps) {
  const router = useRouter()
  const [workshopId, setWorkshopId] = useState(workshops[0]?._id ?? '')
  const [studentId,  setStudentId]  = useState('')
  const [studentEmail, setStudentEmail] = useState('')
  const [monto,      setMonto]      = useState('')
  const [metodoPago, setMetodoPago] = useState<'transferencia' | 'efectivo' | 'otro'>('transferencia')
  // [TIMEZONE] Extrae YYYY-MM-DD del reloj local para evitar que a las 23h en Chile
  // toISOString() devuelva "mañana" (UTC) como fecha por defecto del formulario.
  const localToday = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const [fecha,      setFecha]      = useState(localToday())
  const [notas,      setNotas]      = useState('')

  const [comprobanteUrl, setComprobanteUrl] = useState('')
  const [uploading,  setUploading]  = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /** Busca el studentId a partir del email ingresado */
  const handleEmailBlur = async () => {
    if (!studentEmail) return
    try {
      const res = await fetch(`/api/users/by-email?email=${encodeURIComponent(studentEmail)}`)
      if (res.ok) {
        const data = await res.json()
        setStudentId(data._id)
        setError('')
      } else {
        setStudentId('')
        setError('Alumno no encontrado. Inscríbelo primero desde la sección de inscritos.')
      }
    } catch {
      setStudentId('')
    }
  }

  /** Sube el comprobante a Cloudinary */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setError('El comprobante no puede superar 10 MB'); return }

    setUploading(true)
    setError('')
    try {
      const sigRes = await fetch('/api/upload/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: 'tallerea/comprobantes' }),
      })
      const sigData = await sigRes.json()
      if (!sigRes.ok) throw new Error(sigData.error ?? 'Error al obtener firma')

      const form = new FormData()
      form.append('file', file)
      form.append('api_key', sigData.apiKey)
      form.append('timestamp', String(sigData.timestamp))
      form.append('signature', sigData.signature)
      form.append('folder', sigData.folder)

      const upRes = await fetch(
        `https://api.cloudinary.com/v1_1/${sigData.cloudName}/image/upload`,
        { method: 'POST', body: form }
      )
      const upData = await upRes.json()
      if (!upRes.ok || upData.error) throw new Error(upData.error?.message ?? 'Error al subir')
      setComprobanteUrl(upData.secure_url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir comprobante')
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!studentId) { setError('Ingresa un email válido de alumno existente'); return }

    const montoInt = parseInt(monto, 10)
    if (!Number.isInteger(montoInt) || montoInt < 0) { setError('El monto debe ser un número entero ≥ 0'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/tallerista/manual-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          workshopId,
          monto: montoInt,
          metodoPago,
          fecha,
          notas: notas || undefined,
          comprobanteUrl: comprobanteUrl || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar')

      setSuccess(true)
      // Reset form
      setStudentId(''); setStudentEmail(''); setMonto(''); setNotas(''); setComprobanteUrl('')
      setFecha(localToday())
      if (fileRef.current) fileRef.current.value = ''
      onSuccess?.()
      // Refrescar el Server Component para mostrar el nuevo registro
      router.refresh()
      setTimeout(() => setSuccess(false), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-gray-200 rounded-xl p-5 max-w-lg">
      <h3 className="font-semibold text-gray-800">Registrar pago manual</h3>
      <p className="text-xs text-gray-400">Declarativo — no genera comisión ni entra en liquidaciones.</p>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Taller *</label>
        <select value={workshopId} onChange={e => setWorkshopId(e.target.value)} required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
          {workshops.map(w => <option key={w._id} value={w._id}>{w.titulo}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email del alumno *</label>
        <input type="email" value={studentEmail} onChange={e => setStudentEmail(e.target.value)}
          onBlur={handleEmailBlur} placeholder="alumno@ejemplo.com" required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        {studentId && <p className="text-xs text-green-600 mt-0.5">✓ Alumno encontrado</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Monto (CLP) *</label>
          <input type="number" min={0} value={monto} onChange={e => setMonto(e.target.value)} required
            placeholder="50000"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha del pago *</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Método de pago *</label>
        <select value={metodoPago} onChange={e => setMetodoPago(e.target.value as 'transferencia' | 'efectivo' | 'otro')} required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
          <option value="transferencia">Transferencia bancaria</option>
          <option value="efectivo">Efectivo</option>
          <option value="otro">Otro</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
        <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} maxLength={500}
          placeholder="Ej: Pago mes de abril, precio especial 2024..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Comprobante (opcional)</label>
        <input type="file" ref={fileRef} accept="image/*,application/pdf"
          onChange={handleFileChange} disabled={uploading}
          className="block text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer" />
        {uploading && <p className="text-xs text-gray-400 mt-1">Subiendo comprobante…</p>}
        {comprobanteUrl && (
          <p className="text-xs text-green-600 mt-1">
            ✓ Comprobante subido —{' '}
            <a href={comprobanteUrl} target="_blank" rel="noopener noreferrer" className="underline">ver</a>
          </p>
        )}
      </div>

      {error   && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✓ Pago registrado correctamente.</p>}

      <div className="flex justify-end">
        <button type="submit" disabled={saving || uploading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50 transition-colors">
          {saving ? 'Guardando…' : 'Registrar pago'}
        </button>
      </div>
    </form>
  )
}
