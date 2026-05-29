'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'

const ESPECIALIDADES = [
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
  { value: 'otro', label: 'Otro' },
]

interface PerfilForm {
  name: string
  bio: string
  formacion: string
  credenciales: string
  documentosCredenciales: string[]
  especialidades: string[]
  entregaMateriales: string
  logo: string
  instagram: string
  web: string
  facebook: string
  whatsapp: string
  whatsappEnabled: boolean
}

// Botón IA reutilizable para completar texto con IA
function AiButton({
  campo,
  valorActual,
  especialidades,
  onResult,
}: {
  campo: 'bio' | 'formacion' | 'credenciales'
  valorActual: string
  especialidades: string[]
  onResult: (texto: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function completar() {
    if (valorActual.trim().length < 10) {
      setError('Escribe al menos 10 caracteres antes de usar la IA')
      setTimeout(() => setError(''), 3000)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/taller/ai-perfil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campo,
          datos: valorActual,
          especialidades: especialidades.join(', '),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al generar')
      onResult(data.texto)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al generar')
      setTimeout(() => setError(''), 4000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={completar}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <>
            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generando...
          </>
        ) : (
          <>✦ Completar con IA</>
        )}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}

export default function TalleristaPerfilPage() {
  const [form, setForm] = useState<PerfilForm>({
    name: '',
    bio: '',
    formacion: '',
    credenciales: '',
    documentosCredenciales: [],
    especialidades: [],
    entregaMateriales: '',
    logo: '',
    instagram: '',
    web: '',
    facebook: '',
    whatsapp: '',
    whatsappEnabled: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const docRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/taller/perfil')
      .then(r => r.json())
      .then(data => {
        if (data.taller) {
          const t = data.taller
          setForm({
            name: data.name ?? '',
            bio: t.bio ?? '',
            formacion: t.formacion ?? '',
            credenciales: t.credenciales ?? '',
            documentosCredenciales: t.documentosCredenciales ?? [],
            especialidades: t.especialidades ?? [],
            entregaMateriales: t.entregaMateriales ?? '',
            logo: t.logo ?? '',
            instagram: t.redesSociales?.instagram ?? '',
            web: t.redesSociales?.web ?? '',
            facebook: t.redesSociales?.facebook ?? '',
            whatsapp: t.redesSociales?.whatsapp ?? '',
            whatsappEnabled: !!t.redesSociales?.whatsappEnabled,
          })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function update(field: keyof PerfilForm, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function toggleEspecialidad(value: string) {
    setForm(prev => ({
      ...prev,
      especialidades: prev.especialidades.includes(value)
        ? prev.especialidades.filter(e => e !== value)
        : [...prev.especialidades, value],
    }))
  }

  function removeDoc(url: string) {
    setForm(prev => ({
      ...prev,
      documentosCredenciales: prev.documentosCredenciales.filter(d => d !== url),
    }))
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('La imagen no puede superar 5 MB'); return }

    setUploading(true)
    setError('')
    try {
      const signRes = await fetch('/api/upload/sign?folder=tallerea/logos')
      const { signature, timestamp, folder, cloudName, apiKey } = await signRes.json()

      const formData = new FormData()
      formData.append('file', file)
      formData.append('signature', signature)
      formData.append('timestamp', String(timestamp))
      formData.append('folder', folder)
      formData.append('api_key', apiKey)

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: 'POST', body: formData }
      )
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error?.message ?? 'Error al subir imagen')
      update('logo', uploadData.secure_url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al subir imagen')
    } finally {
      setUploading(false)
    }
  }

  async function handleDocChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (form.documentosCredenciales.length >= 10) {
      setError('Máximo 10 documentos permitidos')
      return
    }
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setError('Solo se permiten PDF, JPG, PNG o WEBP')
      return
    }
    if (file.size > 10 * 1024 * 1024) { setError('El documento no puede superar 10 MB'); return }

    setUploadingDoc(true)
    setError('')
    try {
      // Para PDFs usamos resource_type=raw en Cloudinary
      const isPdf = file.type === 'application/pdf'
      const signRes = await fetch(`/api/upload/sign?folder=tallerea/credenciales&resource_type=${isPdf ? 'raw' : 'image'}`)
      const { signature, timestamp, folder, cloudName, apiKey } = await signRes.json()

      const formData = new FormData()
      formData.append('file', file)
      formData.append('signature', signature)
      formData.append('timestamp', String(timestamp))
      formData.append('folder', folder)
      formData.append('api_key', apiKey)

      const resourceType = isPdf ? 'raw' : 'image'
      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
        { method: 'POST', body: formData }
      )
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error?.message ?? 'Error al subir documento')

      setForm(prev => ({
        ...prev,
        documentosCredenciales: [...prev.documentosCredenciales, uploadData.secure_url],
      }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al subir documento')
    } finally {
      setUploadingDoc(false)
      if (docRef.current) docRef.current.value = ''
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess(false)

    const res = await fetch('/api/taller/perfil', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        bio: form.bio,
        formacion: form.formacion,
        credenciales: form.credenciales,
        documentosCredenciales: form.documentosCredenciales,
        especialidades: form.especialidades,
        entregaMateriales: form.entregaMateriales,
        logo: form.logo,
        redesSociales: {
          instagram: form.instagram,
          web: form.web,
          facebook: form.facebook,
          whatsapp: form.whatsapp,
          whatsappEnabled: form.whatsappEnabled,
        },
      }),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error ?? 'Error al guardar')
    } else {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }
  }

  function getDocName(url: string) {
    try {
      const parts = new URL(url).pathname.split('/')
      return decodeURIComponent(parts[parts.length - 1])
    } catch {
      return 'Documento'
    }
  }

  function isImage(url: string) {
    return /\.(jpg|jpeg|png|webp)$/i.test(url)
  }

  if (loading) {
    return <div className="text-gray-500 text-sm">Cargando...</div>
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi perfil público</h1>
        <p className="text-sm text-gray-500 mt-1">
          Esta información es visible para los alumnos en la página de tus talleres.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Foto de perfil + Nombre */}
        <div className="flex items-center gap-5 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="relative flex-shrink-0">
            {form.logo ? (
              <Image
                src={form.logo}
                alt="Foto de perfil"
                width={80}
                height={80}
                className="w-20 h-20 rounded-full object-cover border-2 border-purple-200"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center text-purple-500 text-2xl font-bold border-2 border-purple-200">
                {form.name ? form.name.charAt(0).toUpperCase() : '?'}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-7 h-7 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-full flex items-center justify-center text-xs shadow transition-colors"
              title="Cambiar foto"
            >
              {uploading ? '…' : '✎'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>

          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre público</label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={form.name}
              onChange={e => update('name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Tu nombre o nombre artístico"
            />
            {uploading && <p className="text-xs text-purple-500 mt-1">Subiendo imagen...</p>}
          </div>
        </div>

        {/* Especialidades */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Especialidades <span className="text-gray-400 font-normal">(selecciona hasta 5)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {ESPECIALIDADES.map(e => (
              <button
                key={e.value}
                type="button"
                onClick={() => toggleEspecialidad(e.value)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  form.especialidades.includes(e.value)
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-purple-400'
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
          {form.especialidades.length === 0 && (
            <p className="text-xs text-red-500 mt-1">Selecciona al menos una especialidad</p>
          )}
        </div>

        {/* Biografía */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">
              Biografía <span className="text-gray-400 font-normal">(mín. 20 caracteres)</span>
            </label>
            <AiButton
              campo="bio"
              valorActual={form.bio}
              especialidades={form.especialidades}
              onResult={texto => update('bio', texto)}
            />
          </div>
          <p className="text-xs text-gray-400 mb-1.5">
            Escribe algunos datos sobre ti y pulsa <strong>Completar con IA</strong> para obtener una biografía profesional.
          </p>
          <textarea
            rows={5}
            required
            minLength={20}
            maxLength={2000}
            value={form.bio}
            onChange={e => update('bio', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-vertical"
            placeholder="Ej: Soy pintora con 10 años de experiencia, especializada en acuarela. Estudié en la Universidad de Chile y he expuesto en galerías de Santiago y Valparaíso..."
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{form.bio.length}/2000</p>
        </div>

        {/* Formación */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">
              Formación <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <AiButton
              campo="formacion"
              valorActual={form.formacion}
              especialidades={form.especialidades}
              onResult={texto => update('formacion', texto)}
            />
          </div>
          <p className="text-xs text-gray-400 mb-1.5">
            Describe tu formación académica o autodidacta y la IA la redactará de forma profesional.
          </p>
          <textarea
            rows={3}
            maxLength={2000}
            value={form.formacion}
            onChange={e => update('formacion', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-vertical"
            placeholder="Ej: Licenciada en Artes USACH, talleres de cerámica en Italia, 15 años enseñando en espacios comunitarios..."
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{form.formacion.length}/2000</p>
        </div>

        {/* Credenciales + Documentos */}
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">
              Credenciales <span className="text-gray-400 font-normal">(mín. 10 caracteres)</span>
            </label>
            <AiButton
              campo="credenciales"
              valorActual={form.credenciales}
              especialidades={form.especialidades}
              onResult={texto => update('credenciales', texto)}
            />
          </div>
          <p className="text-xs text-gray-400 mb-1.5">
            Enumera tus certificaciones, premios y experiencia docente; la IA los redactará de forma clara.
          </p>
          <textarea
            rows={3}
            required
            minLength={10}
            maxLength={2000}
            value={form.credenciales}
            onChange={e => update('credenciales', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-vertical"
            placeholder="Ej: Título Licenciada en Artes, certificado de técnica Shibori, 5 años docente en Fundación Artística..."
          />
          <p className="text-xs text-gray-400 text-right">{form.credenciales.length}/2000</p>

          {/* Documentos acreditadores */}
          <div className="mt-3 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-300">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-gray-700">Documentos acreditadores</p>
                <p className="text-xs text-gray-400">Diplomas, títulos, certificados (PDF, JPG, PNG · máx. 10 MB por archivo)</p>
              </div>
              <button
                type="button"
                onClick={() => docRef.current?.click()}
                disabled={uploadingDoc || form.documentosCredenciales.length >= 10}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-gray-700 border border-gray-300 hover:border-purple-400 disabled:opacity-50 transition-colors"
              >
                {uploadingDoc ? (
                  <>
                    <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Subiendo...
                  </>
                ) : (
                  <>↑ Subir documento</>
                )}
              </button>
              <input
                ref={docRef}
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleDocChange}
              />
            </div>

            {form.documentosCredenciales.length > 0 ? (
              <ul className="space-y-2 mt-3">
                {form.documentosCredenciales.map((url, i) => (
                  <li key={i} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-200">
                    {isImage(url) ? (
                      <Image src={url} alt="doc" width={32} height={32} className="w-8 h-8 object-cover rounded" />
                    ) : (
                      <span className="text-red-500 text-lg">📄</span>
                    )}
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-xs text-blue-600 hover:underline truncate"
                    >
                      {getDocName(url)}
                    </a>
                    <button
                      type="button"
                      onClick={() => removeDoc(url)}
                      className="text-gray-400 hover:text-red-500 transition-colors text-sm"
                      title="Eliminar"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-400 text-center py-2">
                No hay documentos adjuntos aún
              </p>
            )}

            <p className="text-xs text-gray-400 mt-2">
              {form.documentosCredenciales.length}/10 documentos
            </p>
          </div>
        </div>

        {/* Entrega de materiales */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Materiales que provees <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <textarea
            rows={2}
            maxLength={500}
            value={form.entregaMateriales}
            onChange={e => update('entregaMateriales', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Ej: Proveo pinceles, pinturas y telas. Los alumnos traen su delantal."
          />
        </div>

        {/* Redes sociales */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Redes sociales <span className="text-gray-400 font-normal">(opcionales)</span>
          </label>
          {[
            { field: 'instagram' as const, label: 'Instagram', placeholder: 'https://instagram.com/...' },
            { field: 'web' as const, label: 'Sitio web', placeholder: 'https://...' },
            { field: 'facebook' as const, label: 'Facebook', placeholder: 'https://facebook.com/...' },
          ].map(({ field, label, placeholder }) => (
            <div key={field} className="flex items-center gap-3">
              <span className="text-gray-400 text-sm w-24">{label}</span>
              <input
                type="url"
                value={form[field]}
                onChange={e => update(field, e.target.value)}
                placeholder={placeholder}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          ))}
        </div>

        {/* WhatsApp — botón en página pública del taller */}
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-800">
                Botón de WhatsApp en tus talleres
              </label>
              <p className="text-xs text-gray-600 mt-0.5">
                Si lo activas, aparecerá un botón flotante de WhatsApp en la página pública de cada taller tuyo.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
              <input
                type="checkbox"
                checked={form.whatsappEnabled}
                onChange={e => update('whatsappEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-500 text-sm w-24">WhatsApp</span>
            <input
              type="tel"
              inputMode="tel"
              value={form.whatsapp}
              onChange={e => update('whatsapp', e.target.value)}
              placeholder="+56 9 1234 5678"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <p className="text-xs text-gray-500">
            Usa formato internacional. Para Chile: +56 seguido del número de 9 dígitos.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
        )}
        {success && (
          <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded">
            ✓ Perfil actualizado correctamente
          </p>
        )}

        <button
          type="submit"
          disabled={saving || form.especialidades.length === 0}
          className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm px-6 py-2.5 rounded-lg font-medium transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  )
}
