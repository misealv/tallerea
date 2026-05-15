import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { WorkshopFileService } from '@/services/WorkshopFileService'
import { WorkshopService } from '@/services/WorkshopService'
import { validateObjectId } from '@/lib/validate'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// POST /api/workshops/[id]/files/signature
// Body: { mimeType: 'application/pdf' | 'video/mp4' | ... }
// Devuelve firma para que el cliente suba directo a Cloudinary

const SignatureSchema = z.object({
  mimeType: z.string().min(1),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!validateObjectId(params.id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  // Solo el dueño del taller puede subir
  const w = await WorkshopService.getByIdIncludingInactive(params.id)
  if (!w) return NextResponse.json({ error: 'Taller no encontrado' }, { status: 404 })
  if (session.user.role !== 'admin' && String(w.ownerId) !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = SignatureSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Falta mimeType' }, { status: 400 })

  const { getResourceType, WorkshopFileService: WFS } = await import('@/services/WorkshopFileService')
  const resourceType = getResourceType(parsed.data.mimeType)
  if (!resourceType) {
    return NextResponse.json({ error: `Tipo de archivo no permitido: ${parsed.data.mimeType}` }, { status: 400 })
  }

  // Validar cuota antes de firmar — evita uploads huérfanos en Cloudinary
  const cuota = await WFS.cuotaUsada(String(w.ownerId))
  if (cuota.usadoBytes >= cuota.maximoBytes) {
    return NextResponse.json({ error: 'Cuota de almacenamiento llena', cuota }, { status: 413 })
  }

  const firma = WorkshopFileService.generarFirma(params.id, resourceType)
  return NextResponse.json(firma)
}
