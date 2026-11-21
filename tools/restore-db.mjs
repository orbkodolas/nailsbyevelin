// Mentett (már visszafejtett) JSON visszaírása egy táblába (upsert: on conflict (collection, id) do update).
// Használat:  node --env-file=backend/.env tools/restore-db.mjs <mentes.json> --table=<név>
//             node --env-file=backend/.env tools/restore-db.mjs <mentes.json> --table=nbe_records --yes
// Az éles nbe_records táblába csak --yes kapcsolóval ír. A tábla létrejön, ha nincs (store-pg.js sémájával azonos).
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../backend/package.json', import.meta.url))
const pg = require('pg')

const fail = (msg) => { console.error(msg); process.exit(1) }

const input = process.argv.slice(2).find((a) => !a.startsWith('--'))
const table = process.argv.find((a) => a.startsWith('--table='))?.split('=')[1]
const confirmed = process.argv.includes('--yes')
if (!input) fail('Használat: node tools/restore-db.mjs <mentes.json> --table=<név> [--yes]')
if (!table) fail('Kötelező: --table=<név>')
if (!/^[a-z_][a-z0-9_]*$/.test(table)) fail(`Érvénytelen táblanév: ${table}`)
if (table === 'nbe_records' && !confirmed) fail('Az éles nbe_records táblába íráshoz add meg a --yes kapcsolót.')
if (!process.env.DATABASE_URL) fail('DATABASE_URL hiányzik')

const payload = JSON.parse(await readFile(input, 'utf8'))
if (payload.format !== 'nbe-backup-v1' || !Array.isArray(payload.rows)) fail('Ismeretlen mentésformátum')
if (payload.rowCount !== undefined && payload.rowCount !== payload.rows.length) fail('A mentés sorszáma nem egyezik a tartalommal')
for (const r of payload.rows) {
  if (typeof r.collection !== 'string' || r.id === undefined || r.id === null || typeof r.data !== 'object') fail('Hibás sor a mentésben')
}

// Ugyanaz, mint backend/src/store-pg.js normalizeUrl
const normalizeUrl = (url) => url.replace(/([?&])sslmode=(require|prefer|verify-ca)\b/, '$1sslmode=verify-full')

const client = new pg.Client({ connectionString: normalizeUrl(process.env.DATABASE_URL), connectionTimeoutMillis: 20_000 })
await client.connect()
try {
  await client.query('begin')
  await client.query(`
    create table if not exists ${table} (
      collection text not null,
      id text not null,
      seq bigint generated always as identity,
      data jsonb not null,
      updated_at timestamptz not null default now(),
      primary key (collection, id)
    )`)

  const CHUNK = 500
  for (let i = 0; i < payload.rows.length; i += CHUNK) {
    const part = payload.rows.slice(i, i + CHUNK)
    await client.query(
      `insert into ${table} (collection, id, data, updated_at)
       select * from unnest($1::text[], $2::text[], $3::jsonb[], $4::timestamptz[])
       on conflict (collection, id) do update set data = excluded.data, updated_at = excluded.updated_at`,
      [
        part.map((r) => r.collection),
        part.map((r) => String(r.id)),
        part.map((r) => JSON.stringify(r.data)),
        part.map((r) => r.updated_at ?? new Date().toISOString()),
      ],
    )
  }
  await client.query('commit')
  console.log(`Visszaírás kész: ${payload.rows.length} sor -> ${table}`)
} catch (error) {
  await client.query('rollback').catch(() => {})
  throw error
} finally {
  await client.end()
}
