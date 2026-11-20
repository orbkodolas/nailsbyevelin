import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// A ../shared/catalog.json (árak, házirend) a backenddel közös forrás
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
})
