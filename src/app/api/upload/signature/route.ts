import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateSignature } from '@/lib/cloudinary'

export const dynamic = 'force-dynamic'

// POST /api/upload/signature — genera firma para upload directo a Cloudinary
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const { folder } = await req.json()
    const validFolders = ['tallerea/workshops', 'tallerea/accounts', 'tallerea/comprobantes']
    if (!folder || !validFolders.includes(folder)) {
      return NextResponse.json({ error: 'Folder inválido' }, { status: 400 })
    }

    const data = generateSignature(folder)

    // Verificar que cloudinary está configurado
    if (!data.cloudName || !data.apiKey) {
      console.error('[upload/signature] Cloudinary env vars missing:', {
        hasCloudName: !!process.env.CLOUDINARY_CLOUD_NAME,
        hasApiKey: !!process.env.CLOUDINARY_API_KEY,
        hasApiSecret: !!process.env.CLOUDINARY_API_SECRET,
      })
      return NextResponse.json({ error: 'Configuración de Cloudinary incompleta en el servidor' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
