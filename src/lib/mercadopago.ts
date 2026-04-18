import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || '',
})

export const preferenceClient = new Preference(client)
export const paymentClient = new Payment(client)

export interface CreatePreferenceInput {
  enrollmentId: string
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
          id: input.enrollmentId,
          title: input.workshopTitle,
          quantity: 1,
          unit_price: input.amount,
          currency_id: 'CLP',
        },
      ],
      payer: { email: input.payerEmail },
      back_urls: {
        success: `${baseUrl}/mis-talleres?pago=ok`,
        failure: `${baseUrl}/mis-talleres?pago=error`,
        pending: `${baseUrl}/mis-talleres?pago=pendiente`,
      },
      auto_return: 'approved',
      external_reference: input.enrollmentId,
      notification_url: `${baseUrl}/api/payments/webhook`,
    },
  })

  return preference
}
