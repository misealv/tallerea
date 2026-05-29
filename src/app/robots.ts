import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Permitir todo el contenido público
        userAgent: '*',
        allow: '/',
        disallow: [
          '/alumno/',
          '/tallerista/',
          '/admin/',
          '/api/',
          '/talleres/*/inscribirse',
          '/registro-tallerista',
          '/recuperar',
          '/magic',
          '/confirmar-emancipacion',
        ],
      },
    ],
    sitemap: 'https://tallerea.cl/sitemap.xml',
  }
}
