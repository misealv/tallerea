import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { SiteConfigService } from '@/services/SiteConfigService'
import type { ISiteConfig } from '@/models/SiteConfig'

export const dynamic = 'force-dynamic'

// Esquema de validación completo para el PUT — todos los campos son opcionales
const ConfigUpdateSchema = z.object({
  comisionPct:              z.number().int().min(0).max(100).optional(),
  liquidacionMinimaDefault: z.number().int().min(0).optional(),
  cuotaPorTalleristaMB:     z.number().int().min(100).max(102400).optional(),
  // [PAGO AUTOMÁTICO]
  descuentoPagoAutomaticoPct:    z.number().int().min(0).max(100).optional(),
  avisoPreCobroDias:             z.number().int().min(0).max(30).optional(),
  maxIntentosCobroFallido:       z.number().int().min(1).max(10).optional(),
  // [INCENTIVOS] Fase 7
  incentivoAutopagoActivo:        z.boolean().optional(),
  descuentoPagoAutomaticoActivo:  z.boolean().optional(),
  incentivoAutopagoCopyCheckout:  z.string().min(1).max(300).optional(),
  incentivoAutopagoCopyEmail:     z.string().min(1).max(300).optional(),
  autopagoPreseleccionado:        z.boolean().optional(),
}).strict()

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

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const parsed = ConfigUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Input inválido' },
      { status: 400 }
    )
  }

  try {
    const config = await SiteConfigService.update(parsed.data as Partial<ISiteConfig>)
    return NextResponse.json(config)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
