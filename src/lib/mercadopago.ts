import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'

const accessToken = (process.env.MP_ACCESS_TOKEN || '').trim()
if (!accessToken) {
  console.error('[MercadoPago] MP_ACCESS_TOKEN no está definido')
}

const client = new MercadoPagoConfig({ accessToken })

export const preferenceClient = new Preference(client)
export const paymentClient = new Payment(client)

// ─────────────────────────────────────────────────────────────────
// Checkout Pro (pagos únicos)
// ─────────────────────────────────────────────────────────────────
export interface CreatePreferenceInput {
  // Referencia opaca: 'enr:<id>' para enrollment, 'sub:<id>' para subscription
  externalRef: string
  workshopTitle: string
  amount: number
  payerEmail: string
  payerName?: string  // pre-rellena nombre en el checkout de MP
}

export async function createPaymentPreference(input: CreatePreferenceInput) {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

  // Dividir nombre en first/last para que MP pre-rellene el formulario
  const nameParts = (input.payerName ?? '').trim().split(/\s+/)
  const firstName = nameParts[0] ?? ''
  const lastName = nameParts.slice(1).join(' ') || ''

  const preference = await preferenceClient.create({
    body: {
      items: [
        {
          id: input.externalRef,
          title: input.workshopTitle,
          quantity: 1,
          unit_price: input.amount,
          currency_id: 'CLP',
        },
      ],
      payer: {
        email: input.payerEmail,
        ...(firstName && {
          first_name: firstName,
          last_name: lastName,
        }),
      },
      back_urls: {
        success: `${baseUrl}/pago/exitoso`,
        failure: `${baseUrl}/pago/exitoso?estado=error`,
        pending: `${baseUrl}/pago/exitoso?estado=pendiente`,
      },
      auto_return: 'approved',
      external_reference: input.externalRef,
      notification_url: `${baseUrl}/api/payments/webhook`,
    },
  })

  return preference
}

// ─────────────────────────────────────────────────────────────────
// Preapproval — mandato recurrente (pago automático)
// La tarjeta NUNCA llega al backend: viene ya tokenizada por el Brick.
// external_reference tiene prefijo "pa:<subscriptionId>".
// ─────────────────────────────────────────────────────────────────
export interface CreatePreapprovalInput {
  subscriptionId: string        // _id de Subscription
  workshopTitle: string
  payerEmail: string
  cardTokenId: string           // token de un solo uso del CardPayment Brick
  transactionAmount: number     // CLP entero — precioSnapshot de la sub
}

export interface PreapprovalResponse {
  id: string
  status: string
  external_reference: string
  next_payment_date?: string  // ISO string — próximo cobro según MP (usado en reconciliación)
}

export async function createPreapproval(
  input: CreatePreapprovalInput
): Promise<PreapprovalResponse> {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

  const body = {
    reason: input.workshopTitle,
    external_reference: `pa:${input.subscriptionId}`,
    payer_email: input.payerEmail,
    card_token_id: input.cardTokenId,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: input.transactionAmount,
      currency_id: 'CLP',
    },
    back_url: `${baseUrl}/pago/exitoso`,
    status: 'authorized',
  }

  const res = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[MP] createPreapproval error ${res.status}: ${err}`)
  }

  return res.json() as Promise<PreapprovalResponse>
}

/**
 * [FINANCE RISK] Actualiza el monto del preapproval cuando cambia precioSnapshot.
 * Llama PUT /preapproval/{id} con el nuevo transaction_amount.
 */
export async function updatePreapproval(
  mpPreapprovalId: string,
  transactionAmount: number
): Promise<PreapprovalResponse> {
  const res = await fetch(`https://api.mercadopago.com/preapproval/${mpPreapprovalId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auto_recurring: { transaction_amount: transactionAmount },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[MP] updatePreapproval error ${res.status}: ${err}`)
  }

  return res.json() as Promise<PreapprovalResponse>
}

/**
 * Cancela el mandato en MercadoPago (status = 'cancelled').
 * Después de cancelar, MP no cobrará más. El alumni pierde el descuento.
 */
export async function cancelPreapproval(
  mpPreapprovalId: string
): Promise<PreapprovalResponse> {
  const res = await fetch(`https://api.mercadopago.com/preapproval/${mpPreapprovalId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'cancelled' }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[MP] cancelPreapproval error ${res.status}: ${err}`)
  }

  return res.json() as Promise<PreapprovalResponse>
}

/**
 * Obtiene el estado actual de un preapproval.
 * Usado en el webhook `subscription_preapproval` para sincronizar mpPreapprovalStatus.
 */
export async function getPreapproval(
  mpPreapprovalId: string
): Promise<PreapprovalResponse> {
  const res = await fetch(`https://api.mercadopago.com/preapproval/${mpPreapprovalId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[MP] getPreapproval error ${res.status}: ${err}`)
  }

  return res.json() as Promise<PreapprovalResponse>
}

export interface AuthorizedPaymentResponse {
  id: string
  preapproval_id: string
  payment_id: number
  status: string
  transaction_amount: number
  currency_id: string
  fee_details?: Array<{ type: string; amount: number; fee_payer?: string }>
  date_approved?: string
}

/**
 * Obtiene los detalles de un cobro recurrente autorizado.
 * Usado en el webhook `subscription_authorized_payment` para acreditar sesiones.
 * El `authorized_payment_id` es único por cargo y sirve como clave de idempotencia.
 */
export async function getAuthorizedPayment(
  authorizedPaymentId: string
): Promise<AuthorizedPaymentResponse> {
  const res = await fetch(
    `https://api.mercadopago.com/authorized_payments/${authorizedPaymentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[MP] getAuthorizedPayment error ${res.status}: ${err}`)
  }

  return res.json() as Promise<AuthorizedPaymentResponse>
}

/**
 * Pausa el mandato en MercadoPago. MP no cobra hasta que se reactive.
 */
export async function pausePreapproval(
  mpPreapprovalId: string
): Promise<PreapprovalResponse> {
  const res = await fetch(`https://api.mercadopago.com/preapproval/${mpPreapprovalId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'paused' }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[MP] pausePreapproval error ${res.status}: ${err}`)
  }
  return res.json() as Promise<PreapprovalResponse>
}

/**
 * Reactiva un mandato pausado (status = 'authorized').
 */
export async function reactivatePreapproval(
  mpPreapprovalId: string
): Promise<PreapprovalResponse> {
  const res = await fetch(`https://api.mercadopago.com/preapproval/${mpPreapprovalId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'authorized' }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[MP] reactivatePreapproval error ${res.status}: ${err}`)
  }
  return res.json() as Promise<PreapprovalResponse>
}
