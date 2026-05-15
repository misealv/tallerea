'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface FileNode {
  _id: string
  tipo: 'file' | 'folder'
  nombre: string
  visibilidad: 'tallerista' | 'alumnos'
  resourceType?: 'image' | 'video' | 'raw'
  mimeType?: string
  cloudinaryUrl?: string
  size?: number
}
interface BreadcrumbItem { _id: string; nombre: string }

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function FileIcon({ node }: { node: FileNode }) {
  if (node.tipo === 'folder') return <span className="text-xl">📁</span>
  if (node.resourceType === 'image') return <span className="text-xl">🖼️</span>
  if (node.resourceType === 'video') return <span className="text-xl">🎬</span>
  if (node.mimeType === 'application/pdf') return <span className="text-xl">📄</span>
  return <span className="text-xl">📎</span>
}

// Inserta fl_attachment en URLs Cloudinary para forzar descarga en lugar de inline preview.
// El atributo HTML `download` es ignorado en cross-origin; esta es la forma oficial de Cloudinary.
function urlDescarga(url: string, nombre?: string): string {
  if (!url.includes('/upload/')) return url
  const flag = nombre
    ? `fl_attachment:${encodeURIComponent(nombre.replace(/\.[^.]+$/, ''))}`
    : 'fl_attachment'
  return url.replace('/upload/', `/upload/${flag}/`)
}

export default function AlumnoMaterialesPage() {
  const { workshopId } = useParams<{ workshopId: string }>()
  const [parent, setParent] = useState<string | null>(null)
  const [items, setItems] = useState<FileNode[]>([])
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  const cargar = useCallback(async (folderId: string | null) => {
    setLoading(true); setError('')
    try {
      const url = `/api/workshops/${workshopId}/files${folderId ? `?parent=${folderId}` : ''}`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setItems(data.data)
      setBreadcrumb(data.breadcrumb)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error cargando materiales')
    } finally { setLoading(false) }
  }, [workshopId])

  useEffect(() => { cargar(parent) }, [parent, cargar])

  function abrirItem(node: FileNode) {
    if (node.tipo === 'folder') {
      setVideoUrl(null)
      setParent(node._id)
      return
    }
    if (node.resourceType === 'video' && node.cloudinaryUrl) {
      setVideoUrl(node.cloudinaryUrl)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/alumno/mis-talleres" className="text-xs text-gray-400 hover:text-gray-600">← Mis talleres</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Material del taller</h1>
      </div>

      {/* Reproductor de video inline */}
      {videoUrl && (
        <div className="rounded-xl overflow-hidden bg-black shadow-lg">
          <video controls autoPlay src={videoUrl} className="w-full max-h-72" />
          <div className="flex justify-end p-2">
            <button onClick={() => setVideoUrl(null)} className="text-xs text-gray-400 hover:text-gray-200 px-3 py-1">Cerrar</button>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm flex-wrap">
        <button onClick={() => { setParent(null); setVideoUrl(null) }}
          className={`hover:text-purple-600 ${!parent ? 'font-bold text-purple-700 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`}>
          Raíz
        </button>
        {breadcrumb.map(c => (
          <span key={c._id} className="flex items-center gap-1">
            <span className="text-gray-300">/</span>
            <button onClick={() => { setParent(c._id); setVideoUrl(null) }}
              className={`hover:text-purple-600 ${parent === c._id ? 'font-bold text-purple-700 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`}>
              {c.nombre}
            </button>
          </span>
        ))}
      </nav>

      {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Cargando materiales…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No hay material disponible en esta carpeta</p>
      ) : (
        <ul className="space-y-1">
          {items.map(node => (
            <li key={node._id}
              className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-xl px-4 py-3 border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition">
              <button onClick={() => abrirItem(node)} className="flex-shrink-0">
                <FileIcon node={node} />
              </button>
              <div className="flex-1 min-w-0">
                <button onClick={() => abrirItem(node)}
                  className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate block w-full text-left hover:text-purple-600">
                  {node.nombre}
                </button>
                {node.size !== undefined && (
                  <span className="text-[11px] text-gray-400">{fmtBytes(node.size)}</span>
                )}
              </div>
              {/* Acciones: reproducir video o descargar */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {node.tipo === 'file' && node.resourceType === 'video' && node.cloudinaryUrl && (
                  <button onClick={() => setVideoUrl(node.cloudinaryUrl!)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-100 font-medium">
                    ▶ Ver
                  </button>
                )}
                {node.tipo === 'file' && node.cloudinaryUrl && (
                  <a href={urlDescarga(node.cloudinaryUrl, node.nombre)} target="_blank" rel="noopener noreferrer"
                    className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                    ⬇ Descargar
                  </a>
                )}
                {node.tipo === 'folder' && (
                  <button onClick={() => setParent(node._id)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                    Abrir →
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
