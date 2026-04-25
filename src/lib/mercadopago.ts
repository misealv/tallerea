import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'

const accessToken = (process.env.MP_ACCESS_TOKEN || '').trim()
if (!accessToken) {
  console.error('[MercadoPago] MP_ACCESS_TOKEN no está definido')
}

const client = new MercadoPagoConfig({ accessToken })

export const preferenceClient = new Preference(client)
export const paymentClient = new Payment(client)

export interface CreatePreferenceInput {
  // Referencia opaca: 'enr:<id>' para enrollment, 'sub:<id>' para subscription
  externalRef: string
  workshopTitle: string
  amount: number
  payerEmail: string
}

export async function createPaymentPreference(input: CreatePreferenceInput) {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

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
      payer: { email: input.payerEmail },
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
