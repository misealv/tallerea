/**
 * Inserta transformaciones de Cloudinary en una URL existente.
 * Usa c_fill,g_auto para smart cropping centrado en el sujeto principal.
 * Devuelve la URL original si no es de Cloudinary (fallback seguro).
 */
export function getCloudinaryUrl(
  url: string | undefined | null,
  transformation: string
): string | undefined {
  if (!url) return undefined
  // Solo actuar sobre URLs de Cloudinary
  if (!url.includes('res.cloudinary.com') && !url.includes('cloudinary.com/')) return url
  // Insertar la transformación después de /upload/
  return url.replace('/upload/', `/upload/${transformation}/`)
}

// Presets listos para cada contexto
export const TRANSFORM = {
  // Card del listado (~352x176px display, necesita relación ~2:1)
  card: 'c_fill,g_auto,w_800,h_400,q_auto,f_auto',
  // Imagen principal de la galería del detalle (~800x384px)
  gallery: 'c_fill,g_auto,w_1200,h_675,q_auto,f_auto',
  // Thumbnails de la galería (64x48px)
  thumbnail: 'c_fill,g_auto,w_128,h_96,q_auto,f_auto',
} as const
