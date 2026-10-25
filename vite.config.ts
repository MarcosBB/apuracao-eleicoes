import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// base relativa: a mesma build funciona em qualquer caminho (ex.: GitHub Pages em /apuracao-eleicoes/).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 1000 },
})
