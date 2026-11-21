// Új, APK-ba épülő admin eszközkulcs létrehozása és mentése a GitHub NBE_APK_KEY titkos változójába.
// A kulcs nem jelenik meg a képernyőn és nem kerül fájlba; a szerveren csak a lenyomata (hash) van.
// Használat: node --env-file=.env tools/apk-key.mjs [eszköznév]
// Utána: új APK build (Actions → Android APK). Régi kulcs letiltása: admin app → Eszközök fül.
import { spawnSync } from 'node:child_process'

const API = (process.env.API_URL || 'https://nailsbyevelin-api.onrender.com').replace(/\/$/, '')
const name = process.argv[2] || `Admin app (APK, ${new Date().toISOString().slice(0, 10)})`
if (!process.env.ADMIN_TOKEN) { console.error('Hiányzik az ADMIN_TOKEN (node --env-file=.env …)'); process.exit(1) }

const post = async (path, body, auth) => {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body) })
  if (!res.ok) { console.error(`${path}: HTTP ${res.status}`); process.exit(1) }
  return res.json()
}
const { code } = await post('/api/admin/devices/pairing', {}, process.env.ADMIN_TOKEN)
const { token, deviceId } = await post('/api/devices/pair', { code, name })
const gh = spawnSync('gh', ['secret', 'set', 'NBE_APK_KEY', '--repo', process.env.GH_REPO || 'orbkodolas/nailsbyevelin'], { input: token, stdio: ['pipe', 'inherit', 'inherit'] })
if (gh.status !== 0) { console.error('A GitHub secret mentése nem sikerült; a most létrehozott eszközt tiltsd le.'); process.exit(1) }
console.log(`Kész: „${name}” (${deviceId}) → GitHub secret NBE_APK_KEY`)
