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
    if (!url.startsWith('https://images.pexels.com/')) {
      return NextResponse.json({ error: 'URL no permitida' }, { status: 400 })
    }

    const validFolders = ['tallerea/workshops', 'tallerea/accounts']
    const uploadFolder = validFolders.includes(folder) ? folder : 'tallerea/workshops'

    const result = await cloudinary.uploader.upload(url, {
      folder: uploadFolder,
      transformation: [{ width: 1200, height: 800, crop: 'fill', quality: 'auto' }],
    })

    return NextResponse.json({ url: result.secure_url })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al importar imagen'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
