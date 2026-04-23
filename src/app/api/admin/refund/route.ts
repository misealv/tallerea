import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import PaymentBreakdown from '@/models/PaymentBreakdown'
import { FinanceService } from '@/services/FinanceService'
import { SiteConfigService } from '@/services/SiteConfigService'
import { validateObjectId } from '@/lib/validate'

export const dynamic = 'force-dynamic'

// [INMUTABLE] POST crea nuevo PaymentBreakdown tipo:'reembolso' — NO modifica el original
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { breakdownId, motivo } = body

    if (!breakdownId || !validateObjectId(breakdownId)) {
      return NextResponse.json({ error: 'breakdownId inválido' }, { status: 400 })
    }
    if (!motivo || typeof motivo !== 'string' || motivo.trim().length < 5) {
      return NextResponse.json({ error: 'motivo requerido (mínimo 5 caracteres)' }, { status: 400 })
    }

    await dbConnect()

    // Verificar que el breakdown existe y no fue ya reembolsado
    const original = await PaymentBreakdown.findById(breakdownId)
    if (!original) {
      return NextResponse.json({ error: 'Transacción no encontrada' }, { status: 404 })
    }
    if (original.tipo === 'reembolso') {
      return NextResponse.json({ error: 'Este registro ya es un reembolso' }, { status: 400 })
    }
    if (original.estado === 'reembolsado') {
      return NextResponse.json({ error: 'Esta transacción ya fue reembolsada' }, { status: 400 })
    }

    // [FINANCE RISK] Obtener fee desde SiteConfig para registrar correctamente
    const comisionPct = await SiteConfigService.getComisionPct()
    const { feeTallerea, montoProfesor } = FinanceService.calcularDesglose(original.montoBruto, comisionPct)

    // [INMUTABLE] Crear nuevo breakdown tipo:'reembolso' con montos negativos
    const reembolso = await new PaymentBreakdown({
      workshopId: original.workshopId,
      ownerId: original.ownerId,
      studentId: original.studentId,
      subscriptionId: original.subscriptionId,
      enrollmentId: original.enrollmentId,
      montoBruto: -original.montoBruto,
      comisionMP: -original.comisionMP,
      feeTallerea: -feeTallerea,
      montoProfesor: -montoProfesor,
      porcentajeFee: comisionPct,
      precioModalidad: original.precioModalidad,
      tipo: 'reembolso',
      estado: 'cobrado',
      fechaCobro: new Date(),
    }).save()

    // Marcar original como reembolsado
    await PaymentBreakdown.findByIdAndUpdate(breakdownId, { estado: 'reembolsado' })

    // [FINANCE RISK] Audit log
    await FinanceService.log(
      'reembolso',
      'PaymentBreakdown',
      String(reembolso._id),
      -original.montoBruto,
      session.user.id,
      original.montoBruto,
      { originalId: breakdownId, motivo }
    )

    return NextResponse.json(reembolso, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
