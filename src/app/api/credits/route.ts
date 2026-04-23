import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CreditService } from '@/services/CreditService'

// GET /api/credits — alumno autenticado ve su saldo + historial
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page  = Number(searchParams.get('page'))  || 1
  const limit = Number(searchParams.get('limit')) || 20

  try {
    const [saldo, historial] = await Promise.all([
      CreditService.getSaldo(session.user.id),
      CreditService.getHistorial(session.user.id, page, limit),
    ])
    return NextResponse.json({ saldo, historial })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
