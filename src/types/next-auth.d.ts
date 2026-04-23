import 'next-auth'

declare module 'next-auth' {
  interface User {
    role?: string
    tallerEstado?: string | null
  }
  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: 'user' | 'admin'
      tallerEstado: string | null  // 'pendiente' | 'aprobado' | 'rechazado' | 'suspendido' | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: 'user' | 'admin'
    tallerEstado?: string | null
  }
}
