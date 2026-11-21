import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Éles buildben szigorú Content-Security-Policy (OWASP CSP Cheat Sheet). A GitHub Pages nem küld egyedi
// fejlécet, ezért <meta> tagként kerül be; a frame-ancestors itt nem működik, arra a main.tsx keretvédelme szolgál.
function securityMeta(): Plugin {
  return {
    name: 'security-meta',
    apply: 'build',
    transformIndexHtml() {
      const api = process.env.VITE_API_URL ? new URL(process.env.VITE_API_URL).origin : ''
      const csp = [
        "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
        "font-src 'self' data:", `connect-src 'self'${api ? ` ${api}` : ''}`, "object-src 'none'", "base-uri 'self'",
        `form-action 'self'${api ? ` ${api}` : ''}`, 'upgrade-insecure-requests',
      ].join('; ')
      return [
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' },
        { tag: 'meta', attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' }, injectTo: 'head' },
      ]
    },
  }
}

// A ../shared/catalog.json (árak, házirend) a backenddel közös forrás.
// VITE_BASE: alkönyvtár GitHub Pages-hez (pl. /nailsbyevelin/)
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), securityMeta()],
  server: { fs: { allow: ['..'] } },
})
