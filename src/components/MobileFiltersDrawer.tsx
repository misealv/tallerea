'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useSearchParams } from 'next/navigation'
import SearchFilters from './SearchFilters'

/** Filtros que pueden tener un valor activo (todos los que controla SearchFilters) */
const FILTER_KEYS = [
  'tipo', 'modalidad', 'dia', 'comuna', 'precioMax',
  'horario', 'edadRango', 'modeloAcceso', 'clasePrueba', 'conCupo',
]

/**
 * Estado del drawer a nivel de módulo. Sobrevive re-renders y remounts
 * causados por `router.push` desde SearchFilters (Next puede remountar
 * el árbol cliente cuando cambia el segmento de ruta).
 */
let openState = false
const listeners = new Set<() => void>()
function setOpenState(v: boolean) {
  if (openState === v) return
  openState = v
  listeners.forEach(l => l())
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
function getSnapshot() { return openState }
function getServerSnapshot() { return false }

export default function MobileFiltersDrawer() {
  const open = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const setOpen = setOpenState
  const searchParams = useSearchParams()

  // Contar filtros activos para el badge del botón
  const activeCount = FILTER_KEYS.filter(k => searchParams.get(k)).length

  // Bloquear scroll del body cuando el drawer está abierto
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Cerrar con tecla Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {/* Animaciones inline (Tailwind no las tiene por defecto) */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>

      {/* Botón trigger — solo visible en mobile */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden flex items-center justify-center gap-2 w-full bg-white border border-gray-300 hover:border-purple-400 active:bg-gray-50 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 shadow-sm transition-colors"
        aria-label="Abrir filtros"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M6 12h12M10.5 19.5h3" />
        </svg>
        Filtrar talleres
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full bg-purple-600 text-white text-xs font-bold">
            {activeCount}
          </span>
        )}
      </button>

      {/* Backdrop + drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Cerrar filtros"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            style={{ animation: 'fadeIn 200ms ease-out' }}
          />

          {/* Drawer panel — bottom-sheet en mobile */}
          <div
            className="relative w-full max-w-md max-h-[88vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
            style={{ animation: 'slideUp 280ms cubic-bezier(0.32, 0.72, 0, 1)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900">Filtros</h2>
                {activeCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold">
                    {activeCount}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 text-gray-500 transition-colors"
                aria-label="Cerrar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Contenido scrolleable */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <SearchFilters />
            </div>

            {/* Footer fijo con CTA aplicar */}
            <div className="shrink-0 px-5 py-3 border-t border-gray-100 bg-white">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-semibold text-sm py-3 rounded-xl transition-colors"
              >
                Ver resultados
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
