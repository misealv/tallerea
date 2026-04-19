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

    const config = await SiteConfigService.update(updates)
    return NextResponse.json(config)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
