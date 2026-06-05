import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.svg', 'pwa-192x192.svg', 'pwa-512x512.svg'],
      manifest: {
        id: '/',
        name: 'Chat System',
        short_name: 'Chat',
        description: 'Real-time chat with calls, mentions, and encrypted messaging.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    /** Listen on 0.0.0.0 — available at http://localhost:5173 and http://<your-LAN-IP>:5173 */
    host: true,
    port: 5173,
    allowedHosts: ['.trycloudflare.com','.up.railway.app', 'localhost', '127.0.0.1'],
  },
  preview: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 4173,
    allowedHosts: ['.trycloudflare.com','.up.railway.app', 'localhost', '127.0.0.1'],
  },
})
