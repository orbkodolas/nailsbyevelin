// Nem romboló élő biztonsági próba az éles API ellen (adatot nem hoz létre, a saját IP-t nem zárja ki).
// Használat: node --env-file=.env tools/security-probe.mjs [API_URL]   (az .env-ből az ADMIN_TOKEN-t használja)
// Ellenőrzi: biztonsági fejlécek, CORS, admin védelem, IP-hamisítással megkerülhető-e a korlátozás,
// túl nagy kérés, hibás JSON, hibaüzenet-szivárgás, HTTP→HTTPS.
const API = (process.argv[2] || 'https://nailsbyevelin-api.onrender.com').replace(/\/$/, '')
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'OK  ' : 'HIBA'}  ${name}${detail ? ` – ${detail}` : ''}`) }
const randIp = () => `203.0.113.${Math.floor(Math.random() * 250) + 1}`

// 1. Biztonsági fejlécek
const health = await fetch(`${API}/health`)
const h = (name) => health.headers.get(name)
check('X-Content-Type-Options: nosniff', h('x-content-type-options') === 'nosniff', h('x-content-type-options') ?? 'hiányzik')
check('Cache-Control: no-store', (h('cache-control') ?? '').includes('no-store'), h('cache-control') ?? 'hiányzik')
check('Content-Security-Policy (frame-ancestors none)', /frame-ancestors 'none'/.test(h('content-security-policy') ?? ''), h('content-security-policy') ?? 'hiányzik')
check('Strict-Transport-Security', /max-age=\d{7,}/.test(h('strict-transport-security') ?? ''), h('strict-transport-security') ?? 'hiányzik')
check('X-Frame-Options', (h('x-frame-options') ?? '').toUpperCase() === 'DENY', h('x-frame-options') ?? 'hiányzik')
check('Szerver-verzió nem szivárog', !/express|node|\d+\.\d+/i.test(h('x-powered-by') ?? ''), h('x-powered-by') ?? '')

// 2. CORS: idegen origin nem kap engedélyt
const cors = await fetch(`${API}/api/catalog`, { headers: { origin: 'https://evil.example' } })
const allow = cors.headers.get('access-control-allow-origin')
check('CORS nem engedi az idegen oldalt', allow !== '*' && allow !== 'https://evil.example', allow ?? 'nincs')

// 3. Admin védelem
for (const [label, auth] of [['kulcs nélkül', undefined], ['hamis kulccsal', 'Bearer nem-jo'], ['Bearer nélkül', 'valami']]) {
  const res = await fetch(`${API}/api/admin/bookings`, { headers: auth ? { authorization: auth, 'x-forwarded-for': randIp() } : {} })
  check(`Admin ${label} elutasítva`, res.status === 401 || res.status === 429, String(res.status))
}

// 4. IP-hamisítás. Az admin diagnosztika megmutatja, melyik IP-t látja a szerver – hamis fejlécekkel
// küldve. Ha a hamis érték jön vissza, a korlátozás megkerülhető. (ADMIN_TOKEN kell a környezetben;
// a saját IP így nem kerül kizárásra, és adat sem jön létre.)
if (process.env.ADMIN_TOKEN) {
  const spoofXff = '6.6.6.6'; const spoofCf = '7.7.7.7'
  const diag = await fetch(`${API}/api/admin/security`, { headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}`, 'x-forwarded-for': spoofXff, 'true-client-ip': spoofCf } })
  if (!diag.ok || !(diag.headers.get('content-type') ?? '').includes('json')) check('IP-forrás (admin diagnosztika)', false, `HTTP ${diag.status} – a végpont még nincs telepítve`)
  else {
    const data = await diag.json()
    check('A szerver nem a hamisított IP-t látja', ![spoofXff, spoofCf].includes(data.clientIp), `forrás: ${data.source}, IP: ${data.clientIp?.replace(/\.\d+$/, '.x')}`)
    check('Admin kulcs csak hash-ként van a szerveren', data.adminTokenHashed === true, String(data.adminTokenHashed))
    check('Demó fizetés kikapcsolva', data.demoPayments === false, String(data.demoPayments))
  }
} else console.log('—     IP-hamisítás: kihagyva (ADMIN_TOKEN nincs megadva)')

// A Cloudflare a kliens által küldött CF-Connecting-IP-t elutasítja (ettől megbízható ez a fejléc)
const cfSpoof = await fetch(`${API}/health`, { headers: { 'cf-connecting-ip': '7.7.7.7' } })
check('Cloudflare elutasítja a hamis CF-Connecting-IP-t', cfSpoof.status === 403, String(cfSpoof.status))

// 5. Hibás bemenetek
const big = await fetch(`${API}/api/vouchers`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': randIp() }, body: 'x'.repeat(70_000) }).catch((e) => ({ status: `hiba: ${e.message}` }))
check('Túl nagy kérés elutasítva (413/429)', [413, 429].includes(big.status), String(big.status))
const broken = await fetch(`${API}/api/availability?serviceId=../../etc/passwd&from=2026-01-01&to=2099-01-01`)
const brokenText = await broken.text()
check('Hibás paraméter: 400, belső részlet nélkül', broken.status === 400 && !/stack|at \/|node_modules/i.test(brokenText), `${broken.status} ${brokenText.slice(0, 80)}`)
const guess = await fetch(`${API}/api/bookings/00000000-0000-0000-0000-000000000000`, { headers: { 'x-manage-token': 'talalgatas' } })
check('Ismeretlen foglalás / rossz kód: 404, nincs adat', guess.status === 404 || guess.status === 429, String(guess.status))

// 6. HTTP → HTTPS
const plain = await fetch(API.replace('https://', 'http://') + '/health', { redirect: 'manual' }).catch(() => null)
check('Titkosítatlan HTTP átirányít HTTPS-re', !plain || [301, 302, 307, 308].includes(plain.status), plain ? `${plain.status} → ${plain.headers.get('location')}` : 'nem elérhető')

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} rendben${failed.length ? `, ${failed.length} hiba` : ''}`)
process.exitCode = failed.length ? 1 : 0
