// Teljes nbe_records tábla mentése JSON fájlba (csak olvasás). Adatot soha nem ír a konzolra, csak darabszámot.
// Használat:  node --env-file=backend/.env tools/backup-db.mjs <kimeneti.json>
// A kimenet titkosítatlan: a GitHub Actions workflow (backup.yml) titkosítja, helyben a végén töröld.
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

// A pg a backend/node_modules-ban van, ezért onnan töltjük be (ugyanúgy, mint a backend)
const require = createRequire(new URL('../backend/package.json', import.meta.url))
const pg = require('pg')

const TABLE = 'nbe_records'
const out = process.argv.slice(2).find((a) => !a.startsWith('--'))
if (!out) { console.error('Használat: node tools/backup-db.mjs <kimeneti.json>'); process.exit(1) }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL hiányzik'); process.exit(1) }

// Ugyanaz, mint backend/src/store-pg.js normalizeUrl: require/prefer/verify-ca -> verify-full
const normalizeUrl = (url) => url.replace(/([?&])sslmode=(require|prefer|verify-ca)\b/, '$1sslmode=verify-full')

const client = new pg.Client({ connectionString: normalizeUrl(process.env.DATABASE_URL), connectionTimeoutMillis: 20_000 })
await client.connect()
try {
  // Egy pillanatkép: tranzakció REPEATABLE READ, READ ONLY módban
  await client.query('begin isolation level repeatable read read only')
  const { rows } = await client.query(
    `select collection, id, data, updated_at from ${TABLE} order by seq`,
  )
  await client.query('commit')

  const counts = {}
  for (const row of rows) counts[row.collection] = (counts[row.collection] ?? 0) + 1

  const payload = {
    format: 'nbe-backup-v1',
    table: TABLE,
    exportedAt: new Date().toISOString(),
    rowCount: rows.length,
    rows: rows.map((r) => ({ collection: r.collection, id: r.id, data: r.data, updated_at: r.updated_at })),
  }
  await writeFile(out, JSON.stringify(payload), { mode: 0o600 })

  console.log(`Mentés kész: ${out}`)
  console.log(`Összes sor: ${rows.length}`)
  for (const [collection, n] of Object.entries(counts).sort()) console.log(`  ${collection}: ${n}`)
} finally {
  await client.end()
}
