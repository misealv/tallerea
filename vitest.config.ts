import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // 'server-only' es un guard de Next.js que no existe en el entorno de tests Node
      'server-only': path.resolve(__dirname, 'src/__mocks__/server-only.ts'),
    },
  },
})
