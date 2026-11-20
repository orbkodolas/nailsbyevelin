import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// A ../shared/catalog.json (árak, házirend) a backenddel közös forrás.
// VITE_BASE: alkönyvtár GitHub Pages-hez (pl. /nailsbyevelin/)
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
})
