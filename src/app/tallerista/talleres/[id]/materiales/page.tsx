'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const MAX_FILE_SIZE = 500 * 1024 * 1024  // 500 MB por archivo

interface FileNode {
  _id: string
  tipo: 'file' | 'folder'
  nombre: string
  visibilidad: 'tallerista' | 'alumnos'
  resourceType?: 'image' | 'video' | 'raw'
  mimeType?: string
  cloudinaryUrl?: string
  size?: number
  createdAt: string
}
interface BreadcrumbItem { _id: string; nombre: string }
interface Cuota { usadoBytes: number; maximoBytes: number; pct: number }

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function FileIcon({ node }: { node: FileNode }) {
  if (node.tipo === 'folder') return <span className="text-2xl">📁</span>
  if (node.resourceType === 'image') return <span className="text-2xl">🖼️</span>
  if (node.resourceType === 'video') return <span className="text-2xl">🎬</span>
  if (node.mimeType === 'application/pdf') return <span className="text-2xl">📄</span>
  return <span className="text-2xl">📎</span>
}

function urlDescarga(url: string, nombre?: string): string {
  if (!url.includes('/upload/')) return url
  const flag = nombre
    ? `fl_attachment:${encodeURIComponent(nombre.replace(/\.[^.]+$/, ''))}`
    : 'fl_attachment'
  return url.replace('/upload/', `/upload/${flag}/`)
}

const ALLOWED_MIME = [
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/quicktime','video/webm',
  'application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip','text/plain',
]

export default function MaterialesPage() {
  const { id } = useParams<{ id: string }>()

  const [parent, setParent] = useState<string | null>(null)
  const [items, setItems] = useState<FileNode[]>([])
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([])
  const [cuota, setCuota] = useState<Cuota | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showNuevaCarpeta, setShowNuevaCarpeta] = useState(false)
  const [nombreCarpeta, setNombreCarpeta] = useState('')
  const [visibilidadCarpeta, setVisibilidadCarpeta] = useState<'alumnos' | 'tallerista'>('alumnos')
  const [creandoCarpeta, setCreandoCarpeta] = useState(false)

  const [renombrando, setRenombrando] = useState<string | null>(null)
  const [nuevoNombre, setNuevoNombre] = useState('')

  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const [uploadPct, setUploadPct] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async (folderId: string | null) => {
    setLoading(true); setError('')
    try {
      const url = `/api/workshops/${id}/files${folderId ? `?parent=${folderId}` : ''}`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setItems(data.data)
      setBreadcrumb(data.breadcrumb)
      if (data.cuota) setCuota(data.cuota)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error cargando archivos')
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { cargar(parent) }, [parent, cargar])

  async function crearCarpeta() {
    if (!nombreCarpeta.trim()) return
    setCreandoCarpeta(true)
    try {
      const res = await fetch(`/api/workshops/${id}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'folder', nombre: nombreCarpeta.trim(), parentFolderId: parent, visibilidad: visibilidadCarpeta }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowNuevaCarpeta(false); setNombreCarpeta('')
      await cargar(parent)
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
    finally { setCreandoCarpeta(false) }
  }

  async function eliminar(node: FileNode) {
    const msg = node.tipo === 'folder'
      ? `¿Eliminar carpeta "${node.nombre}" y todo su contenido?`
      : `¿Eliminar el archivo "${node.nombre}"?`
    if (!confirm(msg)) return
    const res = await fetch(`/api/workshops/${id}/files/${node._id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); alert(d.error); return }
    await cargar(parent)
  }

  async function guardarNombre(node: FileNode) {
    if (!nuevoNombre.trim() || nuevoNombre.trim() === node.nombre) { setRenombrando(null); return }
    const res = await fetch(`/api/workshops/${id}/files/${node._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nuevoNombre.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { alert(data.error); return }
    setRenombrando(null)
    await cargar(parent)
  }

  async function cambiarVisibilidad(node: FileNode, v: 'alumnos' | 'tallerista') {
    const res = await fetch(`/api/workshops/${id}/files/${node._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibilidad: v }),
    })
    if (!res.ok) { const d = await res.json(); alert(d.error); return }
    await cargar(parent)
  }

  // Subir un archivo a Cloudinary con progreso real (XHR)
  function subirACloudinary(
    url: string,
    form: FormData,
    onProgress: (pct: number) => void,
  ): Promise<{ public_id: string; secure_url: string; bytes: number }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', url)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText)
          if (xhr.status >= 200 && xhr.status < 300) resolve(json)
          else reject(new Error(json.error?.message ?? `Error ${xhr.status}`))
        } catch { reject(new Error('Respuesta inválida de Cloudinary')) }
      }
      xhr.onerror = () => reject(new Error('Error de red'))
      xhr.send(form)
    })
  }

  async function subirArchivos(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!ALLOWED_MIME.includes(file.type)) { alert(`Tipo no permitido: ${file.name}`); continue }
      if (file.size > MAX_FILE_SIZE) { alert(`${file.name} excede 500 MB`); continue }
      setUploadProgress(`Subiendo ${i + 1}/${files.length}: ${file.name}`)
      setUploadPct(0)
      try {
        // 1. Pedir firma
        const sigRes = await fetch(`/api/workshops/${id}/files/signature`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mimeType: file.type }),
        })
        const sig = await sigRes.json()
        if (!sigRes.ok) throw new Error(sig.error ?? `Cuota llena o tipo no permitido`)

        // 2. Subir directo a Cloudinary con progreso
        const form = new FormData()
        form.append('file', file)
        form.append('api_key', sig.apiKey)
        form.append('timestamp', String(sig.timestamp))
        form.append('signature', sig.signature)
        form.append('folder', sig.folder)
        const cdn = await subirACloudinary(
          `https://api.cloudinary.com/v1_1/${sig.cloudName}/${sig.resourceType}/upload`,
          form,
          setUploadPct,
        )

        // 3. Registrar en Mongo
        const regRes = await fetch(`/api/workshops/${id}/files`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'file',
            nombre: file.name,
            parentFolderId: parent,
            visibilidad: 'alumnos',
            cloudinaryPublicId: cdn.public_id,
            cloudinaryUrl: cdn.secure_url,
            mimeType: file.type,
            size: cdn.bytes,
          }),
        })
        const reg = await regRes.json()
        if (!regRes.ok) throw new Error(reg.error)
      } catch (e: unknown) { alert(`Error con ${file.name}: ${e instanceof Error ? e.message : 'Error'}`) }
    }
    setUploading(false); setUploadProgress(''); setUploadPct(0)
    await cargar(parent)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <Link href={`/tallerista/talleres/${id}/editar`} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">← Volver al taller</Link>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">Materiales del taller</h1>
        </div>
        {cuota && (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
            <div className="w-40 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-1">
              <div className={`h-full rounded-full transition-all ${cuota.pct > 90 ? 'bg-red-500' : cuota.pct > 70 ? 'bg-amber-400' : 'bg-purple-500'}`} style={{ width: `${cuota.pct}%` }} />
            </div>
            <span>{fmtBytes(cuota.usadoBytes)} / {fmtBytes(cuota.maximoBytes)}</span>
          </div>
        )}
      </div>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm flex-wrap">
        <button onClick={() => setParent(null)} className={`hover:text-purple-600 ${!parent ? 'font-bold text-purple-700 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`}>Raíz</button>
        {breadcrumb.map(c => (
          <span key={c._id} className="flex items-center gap-1">
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <button onClick={() => setParent(c._id)} className={`hover:text-purple-600 ${parent === c._id ? 'font-bold text-purple-700 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`}>{c.nombre}</button>
          </span>
        ))}
      </nav>

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setShowNuevaCarpeta(v => !v)}
          className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium">
          📁 Nueva carpeta
        </button>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="text-sm px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 font-medium disabled:opacity-50">
          {uploading ? `${uploadProgress} (${uploadPct}%)` : '⬆️ Subir archivos'}
        </button>
        <input ref={fileInputRef} type="file" multiple accept={ALLOWED_MIME.join(',')} className="hidden"
          onChange={e => subirArchivos(e.target.files)} />
      </div>

      {/* Form nueva carpeta */}
      {showNuevaCarpeta && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-2 border border-gray-200 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Nueva carpeta</p>
          <input autoFocus value={nombreCarpeta} onChange={e => setNombreCarpeta(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') crearCarpeta(); if (e.key === 'Escape') setShowNuevaCarpeta(false) }}
            placeholder="Nombre de la carpeta"
            className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-400" />
          <div className="flex items-center gap-3">
            <select value={visibilidadCarpeta} onChange={e => setVisibilidadCarpeta(e.target.value as 'alumnos' | 'tallerista')}
              className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300">
              <option value="alumnos">Visible para alumnos</option>
              <option value="tallerista">Solo tallerista</option>
            </select>
            <button onClick={crearCarpeta} disabled={creandoCarpeta || !nombreCarpeta.trim()}
              className="text-sm px-4 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 font-medium">
              {creandoCarpeta ? 'Creando…' : 'Crear'}
            </button>
            <button onClick={() => { setShowNuevaCarpeta(false); setNombreCarpeta('') }}
              className="text-sm text-gray-400 hover:text-gray-600">Cancelar</button>
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); subirArchivos(e.dataTransfer.files) }}
        className={`border-2 border-dashed rounded-xl p-4 text-center text-sm transition ${dragOver ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-600' : 'border-gray-200 dark:border-gray-700 text-gray-400'}`}
      >
        Arrastra archivos aquí para subirlos
      </div>

      {/* Lista de archivos */}
      {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Esta carpeta está vacía</p>
      ) : (
        <ul className="space-y-1">
          {items.map(node => (
            <li key={node._id}
              className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-xl px-4 py-3 border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition group">
              {/* Icono */}
              <button onClick={() => node.tipo === 'folder' && setParent(node._id)} className={node.tipo === 'folder' ? 'cursor-pointer' : 'cursor-default'}>
                <FileIcon node={node} />
              </button>
              {/* Nombre */}
              <div className="flex-1 min-w-0">
                {renombrando === node._id ? (
                  <input autoFocus value={nuevoNombre}
                    onChange={e => setNuevoNombre(e.target.value)}
                    onBlur={() => guardarNombre(node)}
                    onKeyDown={e => { if (e.key === 'Enter') guardarNombre(node); if (e.key === 'Escape') setRenombrando(null) }}
                    className="w-full text-sm border border-purple-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-purple-400 dark:bg-gray-800 dark:text-white" />
                ) : (
                  <button onClick={() => node.tipo === 'folder' && setParent(node._id)}
                    className={`text-sm font-medium text-gray-800 dark:text-gray-200 truncate block w-full text-left ${node.tipo === 'folder' ? 'hover:text-purple-600' : ''}`}>
                    {node.nombre}
                  </button>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  {node.size !== undefined && <span className="text-[11px] text-gray-400">{fmtBytes(node.size)}</span>}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${node.visibilidad === 'alumnos' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                    {node.visibilidad === 'alumnos' ? 'Alumnos' : 'Solo tú'}
                  </span>
                </div>
              </div>
              {/* Acciones */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                {/* Cambiar visibilidad */}
                <button title={node.visibilidad === 'alumnos' ? 'Hacer privado' : 'Hacer visible para alumnos'}
                  onClick={() => cambiarVisibilidad(node, node.visibilidad === 'alumnos' ? 'tallerista' : 'alumnos')}
                  className="text-[11px] px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
                  {node.visibilidad === 'alumnos' ? '🔒' : '👁️'}
                </button>
                {/* Renombrar */}
                <button title="Renombrar"
                  onClick={() => { setRenombrando(node._id); setNuevoNombre(node.nombre) }}
                  className="text-[11px] px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
                  ✏️
                </button>
                {/* Descargar (solo archivos) */}
                {node.tipo === 'file' && node.cloudinaryUrl && (
                  <a href={urlDescarga(node.cloudinaryUrl, node.nombre)} target="_blank" rel="noopener noreferrer" title="Descargar"
                    className="text-[11px] px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
                    ⬇️
                  </a>
                )}
                {/* Eliminar */}
                <button title="Eliminar" onClick={() => eliminar(node)}
                  className="text-[11px] px-2 py-1 rounded-md border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30">
                  🗑️
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
