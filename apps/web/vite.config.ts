import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  esbuild: { jsx: 'automatic' },
  appType: 'spa',
  server: {
    host: '127.0.0.1',
    port: 7725,
    strictPort: true,
    proxy: {
      '/auth': 'http://127.0.0.1:4000',
      '/rooms': 'http://127.0.0.1:4000',
      '/me/': 'http://127.0.0.1:4000',
      '/chain': 'http://127.0.0.1:4000',
      '/health': 'http://127.0.0.1:4000',
      '/ops': 'http://127.0.0.1:4000',
      '/ws': { target: 'ws://127.0.0.1:4000', ws: true },
    },
  },
})
