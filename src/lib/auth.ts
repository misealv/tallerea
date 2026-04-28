import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { createHash } from 'crypto'
import dbConnect from './db'
import User from '@/models/User'

/**
 * Extrae el _id como string de un campo que puede venir como ObjectId
 * o como objeto populado (ej. `{ _id, name, email }`).
 * Evita el bug `String({_id,...}) === "[object Object]"` en checks de ownership.
 */
export function extractIdString(field: unknown): string {
  if (field == null) return ''
  if (typeof field === 'string') return field
  if (typeof field === 'object' && '_id' in (field as Record<string, unknown>)) {
    return String((field as { _id: unknown })._id)
  }
  return String(field)
}

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

    // Provider para magic link de alumnos (token de un solo uso, 15 min)
    CredentialsProvider({
      id: 'magic-link',
      name: 'magic-link',
      credentials: {
        token: { label: 'Token', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.token) return null

        await dbConnect()
        const tokenHash = createHash('sha256').update(credentials.token).digest('hex')

        // magicLinkToken y magicLinkExpiresAt tienen select:false
        const user = await User.findOne({
          magicLinkToken: tokenHash,
          magicLinkExpiresAt: { $gt: new Date() },
          activo: true,
        }).select('+magicLinkToken +magicLinkExpiresAt')

        if (!user) return null

        // Invalidar token (single-use)
        await User.updateOne({ _id: user._id }, {
          $unset: { magicLinkToken: '', magicLinkExpiresAt: '' },
        })

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
