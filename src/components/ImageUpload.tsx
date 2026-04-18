'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'

interface ImageUploadProps {
  folder: 'tallerea/workshops' | 'tallerea/accounts'
  images: string[]
  onChange: (images: string[]) => void
  max?: number
  label?: string
}

export default function ImageUpload({ folder, images, onChange, max = 5, label = 'Imágenes' }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    if (images.length + files.length > max) {
      setError(`Máximo ${max} imágenes`)
      return
    }

    setUploading(true)
    setError('')

    try {
      // Obtener firma del servidor
      const sigRes = await fetch('/api/upload/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder }),
      })
      const sigData = await sigRes.json()
      if (!sigRes.ok) throw new Error(sigData.error || 'Error al obtener firma')
      if (!sigData.cloudName || !sigData.apiKey) throw new Error('Configuración de Cloudinary incompleta')

      const newUrls: string[] = []

      for (const file of Array.from(files)) {
        // Validar tamaño (máx 10MB)
        if (file.size > 10 * 1024 * 1024) {
          setError(`"${file.name}" excede 10MB`)
          continue
        }

        const formData = new FormData()
        formData.append('file', file)
        formData.append('api_key', sigData.apiKey)
        formData.append('timestamp', String(sigData.timestamp))
        formData.append('signature', sigData.signature)
        formData.append('folder', sigData.folder)

        const upRes = await fetch(
          `https://api.cloudinary.com/v1_1/${sigData.cloudName}/image/upload`,
          { method: 'POST', body: formData }
        )
        const upData = await upRes.json()

        if (!upRes.ok || upData.error) {
          throw new Error(upData.error?.message || `Error subiendo ${file.name}`)
        }
        newUrls.push(upData.secure_url)
      }

      onChange([...images, ...newUrls])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir imagen')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const removeImage = (idx: number) => {
    onChange(images.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm text-gray-600">{label} ({images.length}/{max})</label>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((url, idx) => (
            <div key={idx} className="relative group">
              <Image src={url} alt="" width={96} height={96}
                className="w-24 h-24 object-cover rounded-lg border border-gray-200" />
              <button type="button" onClick={() => removeImage(idx)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {images.length < max && (
        <>
          <input ref={inputRef} type="file" accept="image/*" multiple
            onChange={handleUpload} disabled={uploading}
            className="text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-purple-50 file:text-purple-600 hover:file:bg-purple-100 disabled:opacity-50" />
          {uploading && <p className="text-xs text-purple-600">Subiendo...</p>}
        </>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
