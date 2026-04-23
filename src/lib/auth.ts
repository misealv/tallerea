import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import dbConnect from './db'
import User from '@/models/User'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        await dbConnect()
        // password está con select:false — recuperarlo explícitamente
        const user = await User.findOne({ email: credentials.email.toLowerCase() }).select('+password')
        if (!user || !user.password) return null

        const isValid = await bcrypt.compare(credentials.password, user.password)
        if (!isValid) return null
        if (!user.activo) return null

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          tallerEstado: user.taller?.estado ?? null,
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user.role ?? 'user') as 'user' | 'admin'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.tallerEstado = (user as any).tallerEstado ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = (token.role ?? 'user') as 'user' | 'admin'
        session.user.tallerEstado = (token.tallerEstado ?? null) as string | null
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}
