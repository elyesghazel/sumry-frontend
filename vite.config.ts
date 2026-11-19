import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin `/api` in dev: forward it to a local backend (SUMRY_API_PROXY overrides).
    proxy: {
      '/api': {
        target: process.env.SUMRY_API_PROXY ?? 'http://localhost:48090',
        changeOrigin: true,
      },
    },
  },
})
