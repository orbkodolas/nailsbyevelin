import pg from 'pg'

// Postgres-tár (Neon) ugyanazzal a felülettel, mint a JSON-tár: read(reader) / update(mutator).
// Minden rekord egy sor: (collection, id, data jsonb). Az update egy tranzakcióban, advisory lockkal
// sorosítva fut, és csak a ténylegesen megváltozott / törölt rekordokat írja vissza.
const emptyState = () => ({ bookings: [], reminders: [], payments: [], vouchers: [], blocks: [], devices: [], pairings: [] })
const LOCK_KEY = 74_201_126

// A pg a 'require'-t ma is teljes tanúsítvány-ellenőrzésként kezeli; explicit verify-full = ugyanez, figyelmeztetés nélkül
const normalizeUrl = (url) => url.replace(/([?&])sslmode=(require|prefer|verify-ca)\b/, '$1sslmode=verify-full')

export function createPgStore(connectionString, { table = 'nbe_records', log = console } = {}) {
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error(`Érvénytelen táblanév: ${table}`)
  const pool = new pg.Pool({ connectionString: normalizeUrl(connectionString), max: 4, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 20_000 })
  pool.on('error', (error) => log.error?.('[adatbázis]', error.message))
  let queue = Promise.resolve()
  let ready = null

  const init = () => (ready ??= pool.query(`
    create table if not exists ${table} (
      collection text not null,
      id text not null,
      seq bigint generated always as identity,
      data jsonb not null,
      updated_at timestamptz not null default now(),
      primary key (collection, id)
    )`).catch((error) => { ready = null; throw error }))

  async function load(client) {
    const { rows } = await client.query(`select collection, data from ${table} order by seq`)
    const state = emptyState()
    for (const row of rows) (state[row.collection] ||= []).push(row.data)
    return state
  }

  // collection -> (id -> JSON) pillanatkép a módosítások felismeréséhez
  function snapshot(state) {
    const result = new Map()
    for (const [collection, items] of Object.entries(state)) {
      if (!Array.isArray(items)) continue
      result.set(collection, new Map(items.map((item) => [String(item.id), JSON.stringify(item)])))
    }
    return result
  }

  async function persist(client, before, state) {
    const up = { collection: [], id: [], data: [] }
    const del = { collection: [], id: [] }
    for (const [collection, items] of Object.entries(state)) {
      if (!Array.isArray(items)) continue
      const previous = before.get(collection) ?? new Map()
      const seen = new Set()
      for (const item of items) {
        if (item?.id === undefined || item.id === null) throw new Error(`Azonosító nélküli rekord: ${collection}`)
        const id = String(item.id)
        if (seen.has(id)) throw new Error(`Ismétlődő azonosító: ${collection}/${id}`)
        seen.add(id)
        const data = JSON.stringify(item)
        if (previous.get(id) !== data) { up.collection.push(collection); up.id.push(id); up.data.push(data) }
      }
      for (const id of previous.keys()) if (!seen.has(id)) { del.collection.push(collection); del.id.push(id) }
    }
    if (up.id.length) {
      await client.query(
        `insert into ${table} (collection, id, data)
         select * from unnest($1::text[], $2::text[], $3::jsonb[])
         on conflict (collection, id) do update set data = excluded.data, updated_at = now()`,
        [up.collection, up.id, up.data],
      )
    }
    if (del.id.length) {
      await client.query(`delete from ${table} t using unnest($1::text[], $2::text[]) as d(collection, id) where t.collection = d.collection and t.id = d.id`, [del.collection, del.id])
    }
  }

  return {
    async read(reader) {
      await init()
      return reader(await load(pool))
    },
    async update(mutator) {
      const operation = queue.then(async () => {
        await init()
        const client = await pool.connect()
        try {
          await client.query('begin')
          await client.query('select pg_advisory_xact_lock($1)', [LOCK_KEY])
          const state = await load(client)
          const before = snapshot(state)
          const result = await mutator(state)
          await persist(client, before, state)
          await client.query('commit')
          return result
        } catch (error) {
          await client.query('rollback').catch(() => {})
          throw error
        } finally {
          client.release()
        }
      })
      queue = operation.catch(() => {})
      return operation
    },
    async close() { await pool.end() },
    async drop() { await pool.query(`drop table if exists ${table}`) },
  }
}
