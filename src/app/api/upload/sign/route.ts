import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateSignature } from '@/lib/cloudinary'

// GET /api/upload/sign?folder=<folder>
// Devuelve una firma válida para subir una imagen directamente a Cloudinary desde el cliente.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const folder = req.nextUrl.searchParams.get('folder') ?? 'tallerea'
  const data = generateSignature(folder)
  return NextResponse.json(data)
}
