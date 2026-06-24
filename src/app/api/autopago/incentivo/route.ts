import { NextResponse } from 'next/server'
import { SiteConfigService } from '@/services/SiteConfigService'

export const dynamic = 'force-dynamic'

/**
 * GET /api/autopago/incentivo — devuelve los parámetros de incentivo del auto-pago
 * para que el checkout pueda mostrar el nudge y el descuento.
 * Es un endpoint público (lectura sin efecto); no expone datos sensibles.
 */
export async function GET() {
  try {
    const config = await SiteConfigService.get()

    if (!config.incentivoAutopagoActivo) {
      return NextResponse.json({ activo: false })
    }

    const descuentoPct = config.descuentoPagoAutomaticoActivo
      ? (config.descuentoPagoAutomaticoPct ?? 0)
      : 0

    const copyCheckout = (config.incentivoAutopagoCopyCheckout ?? '')
      .replace(/\{pct\}/g, String(descuentoPct))

    return NextResponse.json({
      activo: true,
      descuentoPct,
      descuentoActivo: config.descuentoPagoAutomaticoActivo ?? false,
      copyCheckout,
      autopagoPreseleccionado: config.autopagoPreseleccionado ?? true,
    })
  } catch {
    // Si falla la lectura de config, no mostrar incentivo (fail safe)
    return NextResponse.json({ activo: false })
  }
}
