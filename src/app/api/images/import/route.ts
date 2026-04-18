import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import cloudinary from '@/lib/cloudinary'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const { url, folder } = await req.json()

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL requerida' }, { status: 400 })
    }

    // Solo permitir URLs de Pexels
    if (!url.includes('images.pexels.com/')) {
      return NextResponse.json({ error: 'URL no permitida' }, { status: 400 })
    }

    const validFolders = ['tallerea/workshops', 'tallerea/accounts']
    const uploadFolder = validFolders.includes(folder) ? folder : 'tallerea/workshops'

    // Subir URL remota a Cloudinary (sin transformación en upload, se aplica al servir)
    const result = await cloudinary.uploader.upload(url, {
      folder: uploadFolder,
      resource_type: 'image',
      format: 'jpg',
    })

    return NextResponse.json({ url: result.secure_url })
  } catch (error: unknown) {
    // Cloudinary errors often have http_code and message
    const err = error as { message?: string; http_code?: number; error?: { message?: string } }
    const message = err?.error?.message || err?.message || 'Error al importar imagen'
    console.error('[images/import] Error:', JSON.stringify({ message, http_code: err?.http_code }))
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
