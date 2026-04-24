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
    // /tallerista/onboarding y /tallerista/pendiente son accesibles a cualquier sesión válida
    const rutasLibres = ['/tallerista/onboarding', '/tallerista/pendiente']
    if (pathname.startsWith('/tallerista') && !rutasLibres.some(r => pathname.startsWith(r))) {
      if (token?.tallerEstado !== 'aprobado') {
        const destino = token?.tallerEstado === 'pendiente'
          ? '/tallerista/pendiente'
          : '/tallerista/onboarding'
        return NextResponse.redirect(new URL(destino, req.url))
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
