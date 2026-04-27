import { MetadataRoute } from 'next'
import { WorkshopService } from '@/services/WorkshopService'
import connectDB from '@/lib/db'
import User from '@/models/User'

export const revalidate = 3600 // regenerar cada hora

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://tallerea.cl'

  // Páginas estáticas
  const static_pages: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${base}/talleres`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/talleristas`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
  ]

  // Páginas de talleres activos
  let workshop_pages: MetadataRoute.Sitemap = []
  try {
    const { data } = await WorkshopService.getAll({}, 1, 500)
    workshop_pages = data.map((w) => ({
      url: `${base}/talleres/${w.slug}`,
      lastModified: (w as unknown as { updatedAt?: Date }).updatedAt ?? new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))
  } catch {
    // Si falla la DB no rompe el sitemap
  }

  // Páginas de talleristas aprobados
  let tallerista_pages: MetadataRoute.Sitemap = []
  try {
    await connectDB()
    const talleristas = await User.find(
      { 'taller.estado': 'aprobado', 'taller.slug': { $exists: true, $ne: '' } },
      { 'taller.slug': 1, updatedAt: 1 }
    ).lean<{ taller: { slug: string }; updatedAt?: Date }[]>()

    tallerista_pages = talleristas.map((u) => ({
      url: `${base}/talleristas/${u.taller.slug}`,
      lastModified: u.updatedAt ?? new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }))
  } catch {
    // Si falla la DB no rompe el sitemap
  }

  return [...static_pages, ...workshop_pages, ...tallerista_pages]
}
