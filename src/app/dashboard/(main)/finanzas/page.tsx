'use client'

export const dynamic = 'force-dynamic'

import FinanceSummary from '@/components/FinanceSummary'

export default function FinanzasPage() {
  const accountId = typeof document !== 'undefined'
    ? document.getElementById('accountId')?.getAttribute('value') || ''
    : ''

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Finanzas</h1>
      <FinanceSummary accountId={accountId} />
    </div>
  )
}
