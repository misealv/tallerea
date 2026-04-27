'use client'

import { useState } from 'react'
import Image from 'next/image'

interface WorkshopGalleryProps {
  imagenes: string[]
  titulo: string
  fallbackEmoji: string
}

export default function WorkshopGallery({ imagenes, titulo, fallbackEmoji }: WorkshopGalleryProps) {
  const [current, setCurrent] = useState(0)

  if (!imagenes || imagenes.length === 0) {
    return (
      <div className="h-64 md:h-80 bg-gray-100 rounded-xl flex items-center justify-center text-7xl mb-6">
        {fallbackEmoji}
      </div>
    )
  }

  const prev = () => setCurrent((c) => (c - 1 + imagenes.length) % imagenes.length)
  const next = () => setCurrent((c) => (c + 1) % imagenes.length)

  return (
    <div className="mb-6">
      {/* Imagen principal */}
      <div className="h-64 md:h-96 bg-gray-100 rounded-xl overflow-hidden relative group">
        <Image
          src={imagenes[current]}
          alt={`${titulo} — foto ${current + 1}`}
          fill
          className="object-cover transition-opacity duration-300"
          sizes="(max-width: 768px) 100vw, 800px"
          priority={current === 0}
        />

        {imagenes.length > 1 && (
          <>
            {/* Botón anterior */}
            <button
              onClick={prev}
              aria-label="Foto anterior"
              className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-9 h-9 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ‹
            </button>

            {/* Botón siguiente */}
            <button
              onClick={next}
              aria-label="Foto siguiente"
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-9 h-9 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ›
            </button>

            {/* Contador */}
            <span className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
              {current + 1} / {imagenes.length}
            </span>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {imagenes.length > 1 && (
        <div className="flex gap-2 mt-2">
          {imagenes.map((src, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              aria-label={`Ver foto ${i + 1}`}
              className={`relative w-16 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${
                i === current ? 'border-purple-500 opacity-100' : 'border-transparent opacity-60 hover:opacity-90'
              }`}
            >
              <Image
                src={src}
                alt={`${titulo} miniatura ${i + 1}`}
                fill
                className="object-cover"
                sizes="64px"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
