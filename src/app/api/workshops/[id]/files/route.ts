import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { WorkshopFileService, getAllowedMimeTypes } from '@/services/WorkshopFileService'
import { WorkshopService } from '@/services/WorkshopService'
import { validateObjectId } from '@/lib/validate'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// Helper: verifica que el taller pertenezca al tallerista autenticado
async function requireWorkshopOwner(workshopId: string, userId: string, role: string) {
  const w = await WorkshopService.getByIdIncludingInactive(workshopId)
  if (!w) return null
  if (role !== 'admin' && String(w.ownerId) !== userId) return null
  return w
}

// GET /api/workshops/[id]/files?parent=<folderId>  (tallerista o alumno inscrito)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!validateObjectId(params.id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const parent = searchParams.get('parent') ?? null   // null = raíz
  if (parent && !validateObjectId(parent)) return NextResponse.json({ error: 'parent inválido' }, { status: 400 })

  const role = session.user.role
  const tallerEstado = (session.user as { tallerEstado?: string }).tallerEstado
  const esTallerista = role === 'admin' || tallerEstado === 'aprobado'

  // Verificar acceso al taller y determinar visibilidad permitida
  const w = await WorkshopService.getByIdIncludingInactive(params.id)
  if (!w) return NextResponse.json({ error: 'Taller no encontrado' }, { status: 404 })

  const esOwner = role === 'admin' || String(w.ownerId) === session.user.id

  let visibilidad: ('tallerista' | 'alumnos')[]
  if (esOwner) {
    visibilidad = ['tallerista', 'alumnos']
  } else {
    // Tallerista no-owner o alumno: requiere suscripción activa o enrollment
    const { default: Subscription } = await import('@/models/Subscription')
    const { default: Enrollment } = await import('@/models/Enrollment')
    const [sub, enr] = await Promise.all([
      Subscription.findOne({ workshopId: params.id, studentId: session.user.id, estado: 'activa', activo: true }).select('_id').lean(),
      Enrollment.findOne({ workshopId: params.id, studentId: session.user.id, estado: { $in: ['pagado', 'activo'] }, activo: true }).select('_id').lean(),
    ])
    if (!sub && !enr) return NextResponse.json({ error: 'Sin acceso a este taller' }, { status: 403 })
    visibilidad = ['alumnos']
  }

  try {
    const [items, breadcrumb, cuota] = await Promise.all([
      WorkshopFileService.listar(params.id, parent, visibilidad),
      WorkshopFileService.breadcrumb(parent, params.id),
      esOwner ? WorkshopFileService.cuotaUsada(session.user.id) : null,
    ])
    return NextResponse.json({ data: items, breadcrumb, cuota })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/workshops/[id]/files — crear carpeta o registrar archivo post-upload
const CreateFolderSchema = z.object({
  tipo: z.literal('folder'),
  nombre: z.string().min(1).max(200),
  parentFolderId: z.string().nullable().default(null),
  visibilidad: z.enum(['tallerista', 'alumnos']).default('alumnos'),
})

const CreateFileSchema = z.object({
  tipo: z.literal('file'),
  nombre: z.string().min(1).max(200),
  parentFolderId: z.string().nullable().default(null),
  visibilidad: z.enum(['tallerista', 'alumnos']).default('alumnos'),
  cloudinaryPublicId: z.string().min(1),
  cloudinaryUrl: z.string().url(),
  mimeType: z.string().refine(m => getAllowedMimeTypes().includes(m), { message: 'Tipo de archivo no permitido' }),
  size: z.number().int().positive(),
})

const CreateSchema = z.discriminatedUnion('tipo', [CreateFolderSchema, CreateFileSchema])

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!validateObjectId(params.id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const w = await requireWorkshopOwner(params.id, session.user.id, session.user.role)
  if (!w) return NextResponse.json({ error: 'Taller no encontrado o sin acceso' }, { status: 403 })

  const parsed = CreateSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Validación', details: parsed.error.flatten() }, { status: 400 })

  try {
    const data = parsed.data
    let result
    if (data.tipo === 'folder') {
      result = await WorkshopFileService.crearCarpeta({
        workshopId: params.id,
        ownerId: String(w.ownerId),
        uploadedBy: session.user.id,
        parentFolderId: data.parentFolderId,
        nombre: data.nombre,
        visibilidad: data.visibilidad,
      })
    } else {
      try {
        result = await WorkshopFileService.registrarArchivo({
          workshopId: params.id,
          ownerId: String(w.ownerId),
          uploadedBy: session.user.id,
          parentFolderId: data.parentFolderId,
          nombre: data.nombre,
          visibilidad: data.visibilidad,
          cloudinaryPublicId: data.cloudinaryPublicId,
          cloudinaryUrl: data.cloudinaryUrl,
          mimeType: data.mimeType,
          size: data.size,
        })
      } catch (err) {
        // Si falla el registro en Mongo, borrar el asset huérfano en Cloudinary
        const { default: cloudinary } = await import('@/lib/cloudinary')
        const { getResourceType } = await import('@/services/WorkshopFileService')
        const rt = getResourceType(data.mimeType) ?? 'raw'
        cloudinary.uploader.destroy(data.cloudinaryPublicId, { resource_type: rt, invalidate: true }).catch(() => null)
        throw err
      }
    }
    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
