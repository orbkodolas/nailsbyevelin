// Párosító kód kérése új admin eszközhöz a mesterkulccsal (a kulcs a gépen marad, a telefonra nem kerül).
// Használat: node --env-file=.env tools/admin-pair.mjs [API_URL]
// A kapott kódot (pl. K7QM-3XPA) 10 percen belül kell beírni az admin app belépő képernyőjén.
const API = (process.argv[2] || process.env.API_URL || 'https://nailsbyevelin-api.onrender.com').replace(/\/$/, '')
if (!process.env.ADMIN_TOKEN) { console.error('Hiányzik az ADMIN_TOKEN (node --env-file=.env …)'); process.exit(1) }
const res = await fetch(`${API}/api/admin/devices/pairing`, { method: 'POST', headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}`, 'content-type': 'application/json' }, body: '{}' })
if (!res.ok) { console.error(`Nem sikerült (HTTP ${res.status}).`); process.exit(1) }
const { code, expiresAt } = await res.json()
const until = new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', timeStyle: 'short' }).format(new Date(expiresAt))
console.log(`\n  Párosító kód:  ${code}\n  Érvényes:      ${until}-ig, egyszer használható\n`)
