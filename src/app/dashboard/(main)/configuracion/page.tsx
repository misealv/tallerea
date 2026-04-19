'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import BankAccountForm from '@/components/BankAccountForm'

interface AccountData {
  _id: string
  nombre: string
  precioModalidad: string
  datosBancarios?: {
    banco: string; tipoCuenta: string; numeroCuenta: string
    rutTitular: string; nombreTitular: string; emailPagos: string
  }
}

export default function ConfiguracionPage() {
  const [account, setAccount] = useState<AccountData | null>(null)
  const [loading, setLoading] = useState(true)
  const [precioModalidad, setPrecioModalidad] = useState('bruto')
  const [savingModalidad, setSavingModalidad] = useState(false)

  const accountId = typeof document !== 'undefined'
    ? document.getElementById('accountId')?.getAttribute('value') || ''
    : ''

  const fetchAccount = useCallback(async () => {
    if (!accountId) return
    const res = await fetch(`/api/accounts/${accountId}`)
    if (res.ok) {
      const data = await res.json()
      setAccount(data)
      setPrecioModalidad(data.precioModalidad || 'bruto')
    }
    setLoading(false)
  }, [accountId])

  useEffect(() => { fetchAccount() }, [fetchAccount])

  async function updatePrecioModalidad(value: string) {
    setPrecioModalidad(value)
    setSavingModalidad(true)
    await fetch(`/api/accounts/${accountId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ precioModalidad: value }),
    })
    setSavingModalidad(false)
  }

  if (loading) return <div className="text-gray-500">Cargando configuración...</div>

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>

      {/* Modalidad de precio */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Modalidad de precio</h2>
        <p className="text-sm text-gray-500">Define cómo quieres establecer los precios de tus talleres.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={() => updatePrecioModalidad('bruto')}
            disabled={savingModalidad}
            className={`p-4 border-2 rounded-lg text-left transition ${
              precioModalidad === 'bruto' ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <p className="font-medium text-gray-900">Precio bruto</p>
            <p className="text-xs text-gray-500 mt-1">
              Tú defines el precio final al alumno. La comisión de Tallerea se descuenta de ese precio.
            </p>
          </button>
          <button
            onClick={() => updatePrecioModalidad('neto')}
            disabled={savingModalidad}
            className={`p-4 border-2 rounded-lg text-left transition ${
              precioModalidad === 'neto' ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <p className="font-medium text-gray-900">Precio neto</p>
            <p className="text-xs text-gray-500 mt-1">
              Tú defines cuánto quieres recibir. Tallerea calcula el precio al alumno sumando la comisión.
            </p>
          </button>
        </div>
      </section>

      {/* Datos bancarios */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Datos bancarios</h2>
        <p className="text-sm text-gray-500">
          Para recibir tus pagos por transferencia bancaria. Estos datos son confidenciales.
        </p>
        {account && (
          <BankAccountForm
            accountId={accountId}
            initial={account.datosBancarios}
            onSaved={fetchAccount}
          />
        )}
      </section>
    </div>
  )
}
