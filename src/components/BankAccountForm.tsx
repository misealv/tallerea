'use client'

import { useState } from 'react'

interface BankData {
  banco: string
  tipoCuenta: string
  numeroCuenta: string
  rutTitular: string
  nombreTitular: string
  emailPagos: string
}

interface BankAccountFormProps {
  accountId: string
  initial?: Partial<BankData>
  onSaved?: () => void
}

const BANCOS = [
  'Banco de Chile', 'Banco Estado', 'Banco Santander', 'BCI', 'Scotiabank',
  'Banco Itaú', 'Banco BICE', 'Banco Security', 'Banco Falabella', 'Banco Ripley',
  'MACH', 'Tenpo', 'Mercado Pago',
]

const TIPOS_CUENTA = [
  { value: 'corriente', label: 'Cuenta Corriente' },
  { value: 'vista', label: 'Cuenta Vista / RUT' },
  { value: 'ahorro', label: 'Cuenta de Ahorro' },
]

export default function BankAccountForm({ accountId, initial, onSaved }: BankAccountFormProps) {
  const [form, setForm] = useState<BankData>({
    banco: initial?.banco || '',
    tipoCuenta: initial?.tipoCuenta || 'vista',
    numeroCuenta: initial?.numeroCuenta || '',
    rutTitular: initial?.rutTitular || '',
    nombreTitular: initial?.nombreTitular || '',
    emailPagos: initial?.emailPagos || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function update(field: keyof BankData, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setSuccess(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    setSuccess(false)

    const res = await fetch(`/api/accounts/${accountId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datosBancarios: form }),
    })

    setSaving(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Error al guardar')
      return
    }

    setSuccess(true)
    onSaved?.()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3">{error}</div>}
      {success && <div className="bg-green-50 text-green-600 text-sm rounded-lg p-3">Datos bancarios guardados correctamente</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Banco</label>
          <select value={form.banco} onChange={e => update('banco', e.target.value)} required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg">
            <option value="">Seleccionar banco</option>
            {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Tipo de cuenta</label>
          <select value={form.tipoCuenta} onChange={e => update('tipoCuenta', e.target.value)} required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg">
            {TIPOS_CUENTA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Número de cuenta</label>
          <input type="text" value={form.numeroCuenta} onChange={e => update('numeroCuenta', e.target.value)} required
            placeholder="Ej: 0012345678" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">RUT del titular</label>
          <input type="text" value={form.rutTitular} onChange={e => update('rutTitular', e.target.value)} required
            placeholder="Ej: 12.345.678-9" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Nombre del titular</label>
          <input type="text" value={form.nombreTitular} onChange={e => update('nombreTitular', e.target.value)} required
            placeholder="Nombre completo" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Email para notificaciones de pago</label>
          <input type="email" value={form.emailPagos} onChange={e => update('emailPagos', e.target.value)} required
            placeholder="pagos@ejemplo.cl" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </div>
      </div>

      <button type="submit" disabled={saving}
        className="bg-purple-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition">
        {saving ? 'Guardando...' : 'Guardar datos bancarios'}
      </button>
    </form>
  )
}
