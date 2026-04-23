import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const { pathname } = req.nextUrl

    // Área admin: requiere role 'admin'
    if (pathname.startsWith('/admin')) {
      if (token?.role !== 'admin') {
        return NextResponse.redirect(new URL('/login', req.url))
      }
    }

    // Área tallerista: solo talleristas aprobados pueden pasar
    // /tallerista/onboarding es accesible a cualquier sesión válida
    if (pathname.startsWith('/tallerista') && !pathname.startsWith('/tallerista/onboarding')) {
      if (token?.tallerEstado !== 'aprobado') {
        return NextResponse.redirect(new URL('/tallerista/onboarding', req.url))
      }
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
)

export const config = {
  // /alumno/acceso queda público para permitir solicitar magic link sin sesión
  matcher: ['/admin/:path*', '/tallerista/:path*', '/alumno/((?!acceso).*)'],
}
