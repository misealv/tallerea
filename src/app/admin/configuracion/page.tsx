'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'

interface Config {
  comisionPct: number
  liquidacionMinimaDefault: number
  cuotaPorTalleristaMB: number
  // [PAGO AUTOMÁTICO]
  descuentoPagoAutomaticoPct: number
  avisoPreCobroDias: number
  maxIntentosCobroFallido: number
  // [INCENTIVOS] Fase 7
  incentivoAutopagoActivo: boolean
  descuentoPagoAutomaticoActivo: boolean
  incentivoAutopagoCopyCheckout: string
  incentivoAutopagoCopyEmail: string
  autopagoPreseleccionado: boolean
}

const DEFAULTS: Config = {
  comisionPct: 15, liquidacionMinimaDefault: 5000, cuotaPorTalleristaMB: 1024,
  descuentoPagoAutomaticoPct: 5, avisoPreCobroDias: 3, maxIntentosCobroFallido: 3,
  incentivoAutopagoActivo: true, descuentoPagoAutomaticoActivo: true,
  incentivoAutopagoCopyCheckout: 'Activa el pago automático y ahorra un {pct}% cada mes. Cancela cuando quieras.',
  incentivoAutopagoCopyEmail: 'Activa el pago automático y ahorra un {pct}% cada mes, sin perder tu cupo. Cancela en 1 clic.',
  autopagoPreseleccionado: true,
}

export default function AdminConfiguracionPage() {
  const [config, setConfig] = useState<Config>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/admin/config').then(r => r.json()).then((data: Partial<Config>) => {
      setConfig({ ...DEFAULTS, ...data })
      setLoading(false)
    })
  }, [])

  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  async function save() {
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    setSaving(false)
    if (res.ok) setMsg('Configuración guardada')
    else {
      const data = await res.json()
      setMsg(data.error || 'Error al guardar')
    }
  }

  // Preview del copy con el % actual interpolado
  const previewCheckout = config.incentivoAutopagoCopyCheckout.replace(/\{pct\}/g, String(config.descuentoPagoAutomaticoPct))
  const previewEmail    = config.incentivoAutopagoCopyEmail.replace(/\{pct\}/g, String(config.descuentoPagoAutomaticoPct))

  if (loading) return <div className="text-gray-500">Cargando...</div>

  return (
    <div className="max-w-xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Configuración del Marketplace</h1>

      {/* ── Sección: Comisiones y liquidaciones ── */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-base font-semibold text-gray-800">Comisiones y liquidaciones</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Comisión de Tallerea (%)
          </label>
          <input type="number" min="0" max="100" value={config.comisionPct}
            onChange={e => set('comisionPct', Number(e.target.value))}
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" />
          <p className="text-xs text-gray-400 mt-1">
            Porcentaje que Tallerea cobra sobre cada pago. Aplica a todos los profesores.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Liquidación mínima por defecto (CLP)
          </label>
          <input type="number" min="0" step="1000" value={config.liquidacionMinimaDefault}
            onChange={e => set('liquidacionMinimaDefault', Number(e.target.value))}
            className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" />
          <p className="text-xs text-gray-400 mt-1">
            Monto mínimo para generar liquidación a un profesor.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cuota de almacenamiento por tallerista (MB)
          </label>
          <input type="number" min="100" max="102400" step="100" value={config.cuotaPorTalleristaMB}
            onChange={e => set('cuotaPorTalleristaMB', Number(e.target.value))}
            className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" />
          <p className="text-xs text-gray-400 mt-1">
            Espacio máximo de materiales por tallerista. 1024 = 1 GB.
          </p>
        </div>
      </section>

      {/* ── Sección: Pago automático (operación) ── */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-base font-semibold text-gray-800">Pago automático — operación</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Días de aviso antes del cobro
          </label>
          <input type="number" min="0" max="30" value={config.avisoPreCobroDias}
            onChange={e => set('avisoPreCobroDias', Number(e.target.value))}
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" />
          <p className="text-xs text-gray-400 mt-1">
            Días de antelación con los que se envía el aviso "Te cobraremos $X el día Y".
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Intentos fallidos antes de degradar a manual
          </label>
          <input type="number" min="1" max="10" value={config.maxIntentosCobroFallido}
            onChange={e => set('maxIntentosCobroFallido', Number(e.target.value))}
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" />
          <p className="text-xs text-gray-400 mt-1">
            Tras N cobros fallidos la suscripción pasa a pendiente_pago.
          </p>
        </div>
      </section>

      {/* ── Sección: Incentivos de pago automático ── */}
      <section className="bg-white rounded-xl border border-purple-100 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Incentivos de pago automático</h2>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={config.incentivoAutopagoActivo}
              onChange={e => set('incentivoAutopagoActivo', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
            <span className={config.incentivoAutopagoActivo ? 'text-purple-700 font-medium' : 'text-gray-400'}>
              {config.incentivoAutopagoActivo ? 'Activos' : 'Desactivados'}
            </span>
          </label>
        </div>

        {!config.incentivoAutopagoActivo && (
          <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
            El nudge está desactivado: no se mostrará ningún descuento ni mensaje de incentivo en checkout ni emails.
          </p>
        )}

        <div className="space-y-4" style={{ opacity: config.incentivoAutopagoActivo ? 1 : 0.4, pointerEvents: config.incentivoAutopagoActivo ? 'auto' : 'none' }}>

          <div className="flex items-start gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descuento por activar (%)
              </label>
              <input type="number" min="0" max="100" value={config.descuentoPagoAutomaticoPct}
                onChange={e => set('descuentoPagoAutomaticoPct', Number(e.target.value))}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" />
              <p className="text-xs text-gray-400 mt-1">
                % que el alumno ahorra al domiciliar. Sale del margen de Tallerea. 0 = sin descuento monetario.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Aplicar descuento</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer mt-2">
                <input type="checkbox" checked={config.descuentoPagoAutomaticoActivo}
                  onChange={e => set('descuentoPagoAutomaticoActivo', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                <span className="text-gray-600">Reducir el cobro en MP</span>
              </label>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1 cursor-pointer">
              <input type="checkbox" checked={config.autopagoPreseleccionado}
                onChange={e => set('autopagoPreseleccionado', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
              Opción preseleccionada en checkout (siempre desmarcable)
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Texto del nudge en checkout
            </label>
            <textarea value={config.incentivoAutopagoCopyCheckout} rows={2}
              onChange={e => set('incentivoAutopagoCopyCheckout', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm" />
            <p className="text-xs text-gray-400 mt-1">
              Usa <code className="bg-gray-100 px-1 rounded">{'{pct}'}</code> para el % actual.
              Vista previa: <em className="text-purple-700">{previewCheckout}</em>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Texto del nudge en email de renovación
            </label>
            <textarea value={config.incentivoAutopagoCopyEmail} rows={2}
              onChange={e => set('incentivoAutopagoCopyEmail', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm" />
            <p className="text-xs text-gray-400 mt-1">
              Usa <code className="bg-gray-100 px-1 rounded">{'{pct}'}</code> para el % actual.
              Vista previa: <em className="text-purple-700">{previewEmail}</em>
            </p>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {msg && <span className={`text-sm ${msg.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>{msg}</span>}
      </div>
    </div>
  )
}


export default function AdminConfiguracionPage() {
  const [config, setConfig] = useState<Config>({
    comisionPct: 15, liquidacionMinimaDefault: 5000, cuotaPorTalleristaMB: 1024,
    descuentoPagoAutomaticoPct: 5, avisoPreCobroDias: 3, maxIntentosCobroFallido: 3,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/admin/config').then(r => r.json()).then(data => {
      setConfig({
        comisionPct: data.comisionPct,
        liquidacionMinimaDefault: data.liquidacionMinimaDefault,
        cuotaPorTalleristaMB: data.cuotaPorTalleristaMB ?? 1024,
        descuentoPagoAutomaticoPct: data.descuentoPagoAutomaticoPct ?? 5,
        avisoPreCobroDias: data.avisoPreCobroDias ?? 3,
        maxIntentosCobroFallido: data.maxIntentosCobroFallido ?? 3,
      })
      setLoading(false)
    })
  }, [])

  async function save() {
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    setSaving(false)
    if (res.ok) setMsg('Configuración guardada')
    else {
      const data = await res.json()
      setMsg(data.error || 'Error al guardar')
    }
  }

  if (loading) return <div className="text-gray-500">Cargando...</div>

  return (
    <div className="max-w-xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Configuración del Marketplace</h1>

      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Comisión de Tallerea (%)
          </label>
          <input type="number" min="0" max="100" value={config.comisionPct}
            onChange={(e) => setConfig(prev => ({ ...prev, comisionPct: Number(e.target.value) }))}
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" />
          <p className="text-xs text-gray-400 mt-1">
            Porcentaje que Tallerea cobra sobre cada pago. Aplica a todos los profesores.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Liquidación mínima por defecto (CLP)
          </label>
          <input type="number" min="0" step="1000" value={config.liquidacionMinimaDefault}
            onChange={(e) => setConfig(prev => ({ ...prev, liquidacionMinimaDefault: Number(e.target.value) }))}
            className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" />
          <p className="text-xs text-gray-400 mt-1">
            Monto mínimo para generar liquidación a un profesor. Si acumula menos, se posterga.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cuota de almacenamiento por tallerista (MB)
          </label>
          <input type="number" min="100" max="102400" step="100" value={config.cuotaPorTalleristaMB}
            onChange={(e) => setConfig(prev => ({ ...prev, cuotaPorTalleristaMB: Number(e.target.value) }))}
            className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" />
          <p className="text-xs text-gray-400 mt-1">
            Espacio máximo de materiales por tallerista. 1024 = 1 GB. Mínimo 100 MB, máximo 100 GB.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving}
            className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition">
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          {msg && <span className={`text-sm ${msg.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>{msg}</span>}
        </div>
      </section>

      {/* Sección: Pago Automático */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-base font-semibold text-gray-800">Pago automático (preapproval MP)</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Descuento por activar pago automático (%)
          </label>
          <input type="number" min="0" max="100" value={config.descuentoPagoAutomaticoPct}
            onChange={(e) => setConfig(prev => ({ ...prev, descuentoPagoAutomaticoPct: Number(e.target.value) }))}
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" />
          <p className="text-xs text-gray-400 mt-1">
            % de descuento que recibe el alumno al domiciliar el pago. 0 = sin descuento.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Días de aviso antes del cobro
          </label>
          <input type="number" min="0" max="30" value={config.avisoPreCobroDias}
            onChange={(e) => setConfig(prev => ({ ...prev, avisoPreCobroDias: Number(e.target.value) }))}
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" />
          <p className="text-xs text-gray-400 mt-1">
            Días de antelación con los que se envía el email "Te cobraremos $X el día Y".
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Intentos fallidos antes de degradar a manual
          </label>
          <input type="number" min="1" max="10" value={config.maxIntentosCobroFallido}
            onChange={(e) => setConfig(prev => ({ ...prev, maxIntentosCobroFallido: Number(e.target.value) }))}
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" />
          <p className="text-xs text-gray-400 mt-1">
            Tras N cobros fallidos la suscripción pasa a pendiente_pago y se notifica al alumno.
          </p>
        </div>
      </section>
    </div>
  )
}
