'use client'

export interface RecurrenciaData {
  tipoRecurrencia: 'unico' | 'semanal' | 'mensual'
  cantidadRepeticiones: number | null
  sesionesIncluidas: number
  vigencia: 'mensual' | 'por_ciclo' | 'sin_vencimiento'
  precioSesionSuelta: number | null
  horasAntesCancelacion: number
  permitirCambioPostPlazo: boolean
  politicaNoShow: 'pierde' | 'reagendar_una_vez'
}

export const RECURRENCIA_DEFAULTS: RecurrenciaData = {
  tipoRecurrencia: 'unico',
  cantidadRepeticiones: null,
  sesionesIncluidas: 4,
  vigencia: 'mensual',
  precioSesionSuelta: null,
  horasAntesCancelacion: 24,
  permitirCambioPostPlazo: false,
  politicaNoShow: 'pierde',
}

interface Props {
  data: RecurrenciaData
  onChange: (data: RecurrenciaData) => void
}

const TIPOS = [
  { value: 'unico', label: 'Sesión única', desc: 'Masterclass o workshop de un día' },
  { value: 'semanal', label: 'Se repite semanalmente', desc: 'Clases regulares cada semana' },
  { value: 'mensual', label: 'Se repite mensualmente', desc: 'Una sesión al mes, día fijo' },
] as const

export default function RecurrenciaConfig({ data, onChange }: Props) {
  function set<K extends keyof RecurrenciaData>(key: K, val: RecurrenciaData[K]) {
    onChange({ ...data, [key]: val })
  }

  const esRecurrente = data.tipoRecurrencia !== 'unico'

  return (
    <div className="space-y-4">
      {/* Tipo de recurrencia */}
      <h2 className="font-semibold text-gray-900">¿Cómo se realiza este taller?</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {TIPOS.map((t) => (
          <button key={t.value} type="button"
            onClick={() => set('tipoRecurrencia', t.value)}
            className={`p-4 border-2 rounded-lg text-left transition ${
              data.tipoRecurrencia === t.value
                ? 'border-purple-600 bg-purple-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}>
            <p className="font-medium text-gray-900">{t.label}</p>
            <p className="text-xs text-gray-500 mt-1">{t.desc}</p>
          </button>
        ))}
      </div>

      {/* Repeticiones (solo recurrente) */}
      {esRecurrente && (
        <div>
          <label className="block text-sm text-gray-600 mb-1">
            {data.tipoRecurrencia === 'semanal' ? '¿Cuántas semanas dura el ciclo?' : '¿Cuántos meses?'}
          </label>
          <input type="number" min="1" max="52"
            value={data.cantidadRepeticiones ?? ''}
            onChange={(e) => set('cantidadRepeticiones', e.target.value ? Number(e.target.value) : null)}
            placeholder="Ej: 4"
            className="w-full max-w-[200px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
          <p className="text-xs text-gray-400 mt-1">Dejar vacío = continuo (sin fecha de término)</p>
        </div>
      )}

      {/* Plan de sesiones (solo recurrente) */}
      {esRecurrente && (
        <div className="border-t border-gray-100 pt-4 space-y-4">
          <h3 className="font-semibold text-gray-900">Plan de sesiones</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Sesiones incluidas en el pago</label>
              <input type="number" min="1" value={data.sesionesIncluidas}
                onChange={(e) => set('sesionesIncluidas', Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Vigencia del plan</label>
              <select value={data.vigencia} onChange={(e) => set('vigencia', e.target.value as RecurrenciaData['vigencia'])}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                <option value="mensual">Mensual (30 días)</option>
                <option value="por_ciclo">Por ciclo (hasta que termine)</option>
                <option value="sin_vencimiento">Sin vencimiento</option>
              </select>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-gray-600 mb-1">
              <input type="checkbox" checked={data.precioSesionSuelta !== null}
                onChange={(e) => set('precioSesionSuelta', e.target.checked ? 10000 : null)}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
              Permitir compra de sesión suelta
            </label>
            {data.precioSesionSuelta !== null && (
              <input type="number" min="0" value={data.precioSesionSuelta}
                onChange={(e) => set('precioSesionSuelta', Number(e.target.value))}
                placeholder="Precio sesión suelta (CLP)"
                className="w-full max-w-[250px] mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            )}
          </div>

          {/* Cancelación y no-show */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Horas para cancelar antes</label>
              <select value={data.horasAntesCancelacion}
                onChange={(e) => set('horasAntesCancelacion', Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                <option value={0}>Sin restricción</option>
                <option value={6}>6 horas</option>
                <option value={12}>12 horas</option>
                <option value={24}>24 horas</option>
                <option value={48}>48 horas</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Si no asiste</label>
              <select value={data.politicaNoShow}
                onChange={(e) => set('politicaNoShow', e.target.value as RecurrenciaData['politicaNoShow'])}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                <option value="pierde">Pierde la sesión</option>
                <option value="reagendar_una_vez">Puede reagendar una vez</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={data.permitirCambioPostPlazo}
              onChange={(e) => set('permitirCambioPostPlazo', e.target.checked)}
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
            Permitir cambio de horario fuera del plazo de cancelación
          </label>
        </div>
      )}
    </div>
  )
}
