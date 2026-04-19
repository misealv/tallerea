import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SlotGeneratorService } from '@/services/SlotGeneratorService'
import { validateObjectId } from '@/lib/validate'

// POST /api/workshops/[id]/generate-slots — Genera slots desde plantilla
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    if (!validateObjectId(params.id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const workshop = await SlotGeneratorService.applyGeneratedSlots(params.id)
    return NextResponse.json({
      success: true,
      slotsCount: workshop?.slots.length ?? 0,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
