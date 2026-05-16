import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/proxy': 'http://localhost:4000',
    },
  },
})
