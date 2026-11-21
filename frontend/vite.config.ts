import react from '@vitejs/plugin-react'
import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite'
import catalog from '../shared/catalog.json' with { type: 'json' }
import { seo, site } from './src/lib/site.ts'

const BASE = process.env.VITE_BASE || '/'
// Az oldal végleges címe (canonical, sitemap, megosztási kép); saját domainnél: VITE_SITE_URL=https://pelda.hu/
const SITE_URL = (process.env.VITE_SITE_URL || `https://orbkodolas.github.io${BASE}`).replace(/\/?$/, '/')

// Keresőoptimalizálás: meta-leírás, kulcsszavak, canonical, Open Graph / megosztási kártya, ikonok és
// schema.org NailSalon strukturált adat (szolgáltatások árakkal) – a JS nélküli robotok is látják.
// Buildben robots.txt és sitemap.xml is készül.
function seoMeta(): Plugin {
  const abs = (path: string) => new URL(path, SITE_URL).href
  const { title, description } = seo
  const prices = catalog.categories.flatMap((c) => c.items.map((i) => i.priceHuf))
  const fmt = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Ft`
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'NailSalon',
    '@id': `${SITE_URL}#salon`,
    name: site.name,
    url: SITE_URL,
    description,
    image: abs(seo.ogImage),
    logo: abs('icon-512.png'),
    priceRange: `${fmt(Math.min(...prices))} – ${fmt(Math.max(...prices))}`,
    currenciesAccepted: 'HUF',
    ...(site.phone ? { telephone: site.phone } : {}),
    address: {
      '@type': 'PostalAddress',
      ...(site.address ? { streetAddress: site.address } : {}),
      addressLocality: site.city,
      postalCode: site.postalCode,
      addressRegion: site.region,
      addressCountry: 'HU',
    },
    areaServed: { '@type': 'City', name: site.city },
    sameAs: [site.facebookUrl, site.instagramUrl].filter(Boolean),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Árlista',
      itemListElement: catalog.categories.map((c) => ({
        '@type': 'OfferCatalog',
        name: c.name,
        itemListElement: c.items.map((i) => ({
          '@type': 'Offer',
          price: i.priceHuf,
          priceCurrency: 'HUF',
          validFrom: catalog.pricesValidFrom,
          itemOffered: { '@type': 'Service', name: c.items.length > 1 ? `${c.name} – ${i.name}` : i.name, description: c.blurb },
        })),
      })),
    },
  }
  const meta = (attrs: Record<string, string>): HtmlTagDescriptor => ({ tag: 'meta', attrs, injectTo: 'head' })
  const link = (attrs: Record<string, string>): HtmlTagDescriptor => ({ tag: 'link', attrs, injectTo: 'head' })
  return {
    name: 'seo-meta',
    transformIndexHtml(html) {
      return {
        html: html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`).replace(/\s*<link rel="icon" href="data:," \/>/, ''),
        tags: [
          meta({ name: 'description', content: description }),
          meta({ name: 'keywords', content: seo.keywords.join(', ') }),
          meta({ name: 'robots', content: 'index, follow, max-image-preview:large' }),
          link({ rel: 'canonical', href: SITE_URL }),
          link({ rel: 'icon', href: `${BASE}favicon.ico`, sizes: '32x32' }),
          link({ rel: 'icon', href: `${BASE}favicon-48.png`, type: 'image/png', sizes: '48x48' }),
          link({ rel: 'apple-touch-icon', href: `${BASE}apple-touch-icon.png` }),
          meta({ property: 'og:type', content: 'website' }),
          meta({ property: 'og:locale', content: 'hu_HU' }),
          meta({ property: 'og:site_name', content: site.name }),
          meta({ property: 'og:title', content: title }),
          meta({ property: 'og:description', content: description }),
          meta({ property: 'og:url', content: SITE_URL }),
          meta({ property: 'og:image', content: abs(seo.ogImage) }),
          meta({ property: 'og:image:width', content: '1200' }),
          meta({ property: 'og:image:height', content: '630' }),
          meta({ property: 'og:image:alt', content: 'Natúr rózsaszín francia műköröm – Nails by Evelin' }),
          meta({ name: 'twitter:card', content: 'summary_large_image' }),
          { tag: 'script', attrs: { type: 'application/ld+json' }, children: JSON.stringify(schema), injectTo: 'head' },
        ],
      }
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n` })
      this.emitFile({
        type: 'asset', fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE_URL}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`,
      })
    },
  }
}

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
  base: BASE,
  plugins: [react(), securityMeta(), seoMeta()],
  server: { fs: { allow: ['..'] } },
})
