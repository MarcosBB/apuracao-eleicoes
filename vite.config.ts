import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { tsePlugin } from './server/tsePlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tsePlugin()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { chunkSizeWarningLimit: 1000 },
})
