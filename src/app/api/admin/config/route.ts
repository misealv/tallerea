import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SiteConfigService } from '@/services/SiteConfigService'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const config = await SiteConfigService.get()
    return NextResponse.json(config)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const updates: Record<string, number> = {}

    if (body.comisionPct !== undefined) {
      const pct = Number(body.comisionPct)
      if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
        return NextResponse.json({ error: 'Comisión debe ser entero entre 0 y 100' }, { status: 400 })
      }
      updates.comisionPct = pct
    }

    if (body.liquidacionMinimaDefault !== undefined) {
      const min = Number(body.liquidacionMinimaDefault)
      if (!Number.isInteger(min) || min < 0) {
        return NextResponse.json({ error: 'Liquidación mínima debe ser entero positivo' }, { status: 400 })
      }
      updates.liquidacionMinimaDefault = min
    }

    if (body.cuotaPorTalleristaMB !== undefined) {
      const mb = Number(body.cuotaPorTalleristaMB)
      if (!Number.isInteger(mb) || mb < 100 || mb > 102400) {
        return NextResponse.json({ error: 'Cuota debe ser entero entre 100 MB y 100 GB (102400)' }, { status: 400 })
      }
      updates.cuotaPorTalleristaMB = mb
    }

    // [PAGO AUTOMÁTICO] Validación de campos nuevos
    if (body.descuentoPagoAutomaticoPct !== undefined) {
      const pct = Number(body.descuentoPagoAutomaticoPct)
      if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
        return NextResponse.json({ error: 'Descuento auto-pago debe ser entero entre 0 y 100' }, { status: 400 })
      }
      updates.descuentoPagoAutomaticoPct = pct
    }

    if (body.avisoPreCobroDias !== undefined) {
      const dias = Number(body.avisoPreCobroDias)
      if (!Number.isInteger(dias) || dias < 0 || dias > 30) {
        return NextResponse.json({ error: 'Aviso pre-cobro debe ser entero entre 0 y 30 días' }, { status: 400 })
      }
      updates.avisoPreCobroDias = dias
    }

    if (body.maxIntentosCobroFallido !== undefined) {
      const max = Number(body.maxIntentosCobroFallido)
      if (!Number.isInteger(max) || max < 1 || max > 10) {
        return NextResponse.json({ error: 'Máximo intentos debe ser entero entre 1 y 10' }, { status: 400 })
      }
      updates.maxIntentosCobroFallido = max
    }

    const config = await SiteConfigService.update(updates)
    return NextResponse.json(config)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
