import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Popostapo Books',
        short_name: 'Popostapo',
        description: 'Cataloga i tuoi libri da telefono',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    https: {
      cert: readFileSync('.cert/localhost.pem'),
      key: readFileSync('.cert/localhost-key.pem'),
    },
    proxy: {
      '/api': 'http://127.0.0.1:8002',
      '/uploads': 'http://127.0.0.1:8002',
    },
  },
})
