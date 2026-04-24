'use client'

import { useState } from 'react'
import type { ModalidadPrecio, IPrecioFijo, IAporteVoluntario, IPaquete, IClasePrueba } from '@/models/Workshop'

export interface EditorPreciosValue {
  modalidadPrecio: ModalidadPrecio
  precioFijo?: IPrecioFijo
  aporteVoluntario?: IAporteVoluntario
  paquetes?: Omit<IPaquete, '_id'>[]
  clasePrueba?: IClasePrueba
}

interface Props {
  value: EditorPreciosValue
  onChange: (next: EditorPreciosValue) => void
  modeloAcceso: 'puntual' | 'recurrente'
}

const MODALIDADES: { value: ModalidadPrecio; label: string; desc: string; requiere?: 'puntual' | 'recurrente' }[] = [
  { value: 'gratuito',   label: 'Gratuito',          desc: 'Sin cobro para el alumno', requiere: 'recurrente' },
  { value: 'fijo',       label: 'Precio fijo',        desc: 'Un precio único por inscripción', requiere: 'puntual' },
  { value: 'voluntario', label: 'Aporte voluntario',  desc: 'El alumno elige cuánto pagar', requiere: 'puntual' },
  { value: 'paquetes',   label: 'Paquetes',           desc: 'Planes con sesiones incluidas', requiere: 'recurrente' },
]

export default function EditorPrecios({ value, onChange, modeloAcceso }: Props) {
  const [nuevoPaquete, setNuevoPaquete] = useState({
    nombre: '', precio: '', sesionesIncluidas: '', duracionDias: '30',
  })

  function setModal(m: ModalidadPrecio) {
    onChange({ ...value, modalidadPrecio: m })
  }

  const modalidades = MODALIDADES.filter(m => !m.requiere || m.requiere === modeloAcceso)

  return (
    <div className="space-y-6">
      {/* Selector de modalidad */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Modelo de precio</label>
        <div className="grid grid-cols-2 gap-3">
          {modalidades.map(m => (
            <button
              key={m.value}
              type="button"
              onClick={() => setModal(m.value)}
              className={`p-3 rounded-lg border-2 text-left transition-colors ${
                value.modalidadPrecio === m.value
                  ? 'border-indigo-600 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="font-medium text-sm">{m.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Precio fijo */}
      {value.modalidadPrecio === 'fijo' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Precio por inscripción (CLP)
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={value.precioFijo?.monto ?? ''}
            onChange={e => onChange({ ...value, precioFijo: { monto: Math.round(Number(e.target.value)) } })}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            placeholder="Ej: 15000"
          />
        </div>
      )}

      {/* Aporte voluntario */}
      {value.modalidadPrecio === 'voluntario' && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Aporte voluntario (CLP)</label>
          {(['sugerido', 'minimo'] as const).map(campo => (
            <div key={campo}>
              <label className="block text-xs text-gray-500 mb-1 capitalize">{campo}</label>
              <input
                type="number"
                min={0}
                step={1}
                value={value.aporteVoluntario?.[campo] ?? ''}
                onChange={e => onChange({
                  ...value,
                  aporteVoluntario: {
                    sugerido: value.aporteVoluntario?.sugerido ?? 0,
                    minimo:   value.aporteVoluntario?.minimo ?? 0,
                    maximo:   value.aporteVoluntario?.maximo ?? null,
                    [campo]:  Math.round(Number(e.target.value)),
                  },
                })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Máximo (vacío = sin límite)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={value.aporteVoluntario?.maximo ?? ''}
              onChange={e => {
                const v = e.target.value === '' ? null : Math.round(Number(e.target.value))
                onChange({
                  ...value,
                  aporteVoluntario: {
                    sugerido: value.aporteVoluntario?.sugerido ?? 0,
                    minimo:   value.aporteVoluntario?.minimo ?? 0,
                    maximo:   v,
                  },
                })
              }}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="Sin límite"
            />
          </div>
        </div>
      )}

      {/* Paquetes */}
      {value.modalidadPrecio === 'paquetes' && (
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">Paquetes</label>
          {(value.paquetes ?? []).length > 0 && (
            <div className="space-y-2">
              {(value.paquetes ?? []).map((pq, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-md p-3 text-sm">
                  <div className="flex-1">
                    <span className="font-medium">{pq.nombre}</span>
                    <span className="text-gray-500 ml-2">
                      {pq.sesionesIncluidas} ses · {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(pq.precio)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...(value.paquetes ?? [])]
                      next[i] = { ...next[i], activo: !next[i].activo }
                      onChange({ ...value, paquetes: next })
                    }}
                    className={`text-xs px-2 py-0.5 rounded ${pq.activo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}
                  >
                    {pq.activo ? 'Activo' : 'Inactivo'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = (value.paquetes ?? []).filter((_, idx) => idx !== i)
                      onChange({ ...value, paquetes: next })
                    }}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Formulario nuevo paquete */}
          <div className="border border-dashed border-gray-300 rounded-md p-4 space-y-3">
            <p className="text-xs font-medium text-gray-500">Agregar paquete</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nombre</label>
                <input
                  type="text"
                  value={nuevoPaquete.nombre}
                  onChange={e => setNuevoPaquete(prev => ({ ...prev, nombre: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="Ej: Mensual"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Precio (CLP)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={nuevoPaquete.precio}
                  onChange={e => setNuevoPaquete(prev => ({ ...prev, precio: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="Ej: 30000"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Sesiones incluidas</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={nuevoPaquete.sesionesIncluidas}
                  onChange={e => setNuevoPaquete(prev => ({ ...prev, sesionesIncluidas: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="Ej: 4"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Duración (días)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={nuevoPaquete.duracionDias}
                  onChange={e => setNuevoPaquete(prev => ({ ...prev, duracionDias: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="30"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const nombre = nuevoPaquete.nombre.trim()
                const precio = Math.round(Number(nuevoPaquete.precio))
                const sesiones = Math.round(Number(nuevoPaquete.sesionesIncluidas))
                const dias = Math.round(Number(nuevoPaquete.duracionDias)) || 30
                if (!nombre || isNaN(precio) || precio < 0 || isNaN(sesiones) || sesiones < 1) return
                const nuevo: Omit<IPaquete, '_id'> = {
                  nombre,
                  precio,
                  sesionesIncluidas: sesiones,
                  duracionDias: dias,
                  activo: true,
                  orden: (value.paquetes ?? []).length,
                }
                onChange({ ...value, paquetes: [...(value.paquetes ?? []), nuevo] })
                setNuevoPaquete({ nombre: '', precio: '', sesionesIncluidas: '', duracionDias: '30' })
              }}
              className="w-full bg-indigo-600 text-white text-sm py-2 rounded-md hover:bg-indigo-700"
            >
              + Agregar paquete
            </button>
          </div>
        </div>
      )}

      {/* Clase de prueba — disponible para todos los modelos */}
      <div className="border-t pt-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={value.clasePrueba?.habilitada ?? false}
            onChange={e => onChange({
              ...value,
              clasePrueba: {
                habilitada: e.target.checked,
                precio: value.clasePrueba?.precio ?? 0,
                limitePorAlumno: 1,
              },
            })}
            className="h-4 w-4 rounded text-indigo-600"
          />
          <div>
            <p className="text-sm font-medium">Clase de prueba</p>
            <p className="text-xs text-gray-500">Permite a nuevos alumnos asistir a 1 clase antes de inscribirse</p>
          </div>
        </label>
        {value.clasePrueba?.habilitada && (
          <div className="mt-3 ml-7">
            <label className="block text-xs text-gray-500 mb-1">Precio (0 = gratuita)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={value.clasePrueba.precio ?? 0}
              onChange={e => onChange({
                ...value,
                clasePrueba: {
                  ...value.clasePrueba!,
                  precio: Math.round(Number(e.target.value)),
                },
              })}
              className="w-48 border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="0"
            />
          </div>
        )}
      </div>
    </div>
  )
}
