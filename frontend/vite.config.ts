import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Load env vars (VITE_*) from the repo-root .env so the frontend and gateway
  // share one source of truth (VITE_API_BASE, VITE_GOOGLE_CLIENT_ID, ...).
  envDir: resolve(__dirname, '..'),
  plugins: [react(), tailwindcss()],
})
