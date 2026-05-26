import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    /** Listen on 0.0.0.0 — available at http://localhost:5173 and http://<your-LAN-IP>:5173 */
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
})
