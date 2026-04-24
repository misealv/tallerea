'use client'

import { signOut } from 'next-auth/react'

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/' })}
      className="text-gray-500 hover:text-red-600 text-sm transition-colors"
    >
      Salir
    </button>
  )
}
