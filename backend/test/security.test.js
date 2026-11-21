// Támadás-szimulációk: IP-hamisítás, bot-csapdák, admin brute force, elárasztás, nyílt átirányítás, injekció.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { createApp } from '../src/app.js'
import { clientIp, createLimiter, sameSecret } from '../src/security.js'
import { zonedToUtc } from '../src/time.js'

const START = '2026-11-23T08:00:00.000Z'
const slotAt = (date, time) => zonedToUtc(date, time, 'Europe/Budapest').toISOString()
const guest = (overrides = {}) => ({ name: 'Teszt Vendég', phone: '+36 30 123 4567', email: 'vendeg@example.com', serviceId: 'gel-egyszinu', acceptedRules: true, formMs: 8000, ...overrides })

async function withApi(config, run, extra = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'nails-sec-'))
  const logs = []
  const app = createApp({ dataFile: join(dir, 'db.json'), adminToken: 'test-secret', now: () => new Date(START), log: { info() {}, error: (m) => logs.push(String(m)) }, config, ...extra })
  const server = createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const call = (method, path, body, headers = {}) => fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
  try { await run({ base, call, app, server, logs }) } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
    await app.idle()
    await rm(dir, { recursive: true, force: true })
  }
}

test('IP-hamisítás: a bal szélső X-Forwarded-For nem kerüli meg a korlátot, a CF-Connecting-IP számít', async () => {
  await withApi({ trustProxy: true, createPerHour: 3, createPerDay: 100, minFormMs: 0 }, async ({ call }) => {
    // A támadó minden kérésnél más hamis IP-t ír az XFF elejére; a Cloudflare-es valódi IP ugyanaz
    const statuses = []
    for (let i = 0; i < 5; i++) {
      const res = await call('POST', '/api/bookings', { bad: true }, { 'x-forwarded-for': `10.0.0.${i}, 203.0.113.7`, 'cf-connecting-ip': '198.51.100.9' })
      statuses.push(res.status)
    }
    assert.deepEqual(statuses, [400, 400, 400, 429, 429])
    // Másik valódi kliens nincs letiltva
    assert.equal((await call('POST', '/api/bookings', { bad: true }, { 'cf-connecting-ip': '198.51.100.10' })).status, 400)
  })
  // CF fejléc nélkül az XFF jobb szélső (proxy által írt) eleme számít, a hamisítható bal szélső nem
  const req = (headers) => ({ headers, socket: { remoteAddress: '10.1.1.1' } })
  assert.equal(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }), true).ip, '5.6.7.8')
  assert.equal(clientIp(req({ 'cf-connecting-ip': 'nem-ip', 'x-forwarded-for': 'szemét' }), true).ip, '10.1.1.1')
  assert.equal(clientIp(req({ 'cf-connecting-ip': '9.9.9.9' }), false).ip, '10.1.1.1') // proxy nélkül a fejléc nem számít
  assert.equal(clientIp(req({ 'true-client-ip': '6.6.6.6', 'x-forwarded-for': '6.6.6.6, 5.6.7.8' }), true).ip, '5.6.7.8') // a hamisítható True-Client-IP nem számít
})

test('bot-csapdák: honeypot mező és túl gyors kitöltés elutasítva, emberi kitöltés átmegy', async () => {
  await withApi({ minFormMs: 2500 }, async ({ call }) => {
    assert.equal((await call('POST', '/api/bookings', guest({ website: 'http://spam', startsAt: slotAt('2026-11-24', '09:00') }))).status, 400)
    assert.equal((await call('POST', '/api/bookings', guest({ formMs: 300, startsAt: slotAt('2026-11-24', '09:00') }))).status, 400)
    assert.equal((await call('POST', '/api/bookings', guest({ formMs: undefined, startsAt: slotAt('2026-11-24', '09:00') }))).status, 400)
    assert.equal((await call('POST', '/api/vouchers', { amountHuf: 15000, buyerName: 'Vevő Vera', buyerEmail: 'v@example.com', formMs: 100 })).status, 400)
    assert.equal((await call('POST', '/api/bookings', guest({ startsAt: slotAt('2026-11-24', '09:00') }))).status, 201)
  })
})

test('admin brute force: 10 hibás kulcs után kizárás, alatta a helyes kulcs sem megy; más IP-t nem érint', async () => {
  await withApi({ trustProxy: true }, async ({ call, logs }) => {
    const attacker = { 'cf-connecting-ip': '198.51.100.66' }
    for (let i = 0; i < 10; i++) assert.equal((await call('GET', '/api/admin/bookings', undefined, { ...attacker, authorization: `Bearer guess-${i}` })).status, 401)
    const locked = await call('GET', '/api/admin/bookings', undefined, { ...attacker, authorization: 'Bearer test-secret' })
    assert.equal(locked.status, 429)
    assert.ok(Number(locked.headers.get('retry-after')) > 0)
    assert.equal((await call('GET', '/api/admin/bookings', undefined, { 'cf-connecting-ip': '198.51.100.1', authorization: 'Bearer test-secret' })).status, 200)
    assert.ok(logs.some((line) => line.includes('sikertelen admin')))
    // Formátumhibák (Bearer nélkül, üres) is hibának számítanak, nem okoznak szerverhibát
    assert.equal((await call('GET', '/api/admin/bookings', undefined, { authorization: 'test-secret' })).status, 401)
  })
})

test('admin kulcs hash-ként: a szerver csak a SHA-256-ot ismeri; a régi nyers kulcs már nem érvényes', async () => {
  const key = 'uj-nagyon-hosszu-veletlen-kulcs-0123456789'
  const hash = createHash('sha256').update(key).digest('hex')
  await withApi({ adminTokenSha256: hash }, async ({ call }) => {
    assert.equal((await call('GET', '/api/admin/bookings', undefined, { authorization: `Bearer ${key}` })).status, 200)
    assert.equal((await call('GET', '/api/admin/bookings', undefined, { authorization: 'Bearer test-secret' })).status, 401)
    assert.equal((await call('GET', '/api/admin/bookings', undefined, { authorization: `Bearer ${hash}` })).status, 401) // a hash maga nem kulcs
  })
  assert.equal(sameSecret('a', 'a'), true)
  assert.equal(sameSecret('a', 'ab'), false)
  assert.equal(sameSecret('', ''), false)
})

test('éles adatbázissal a fejlesztői alapkulcs le van zárva (fail-closed)', async () => {
  const fakeStore = { read: async (fn) => fn({ bookings: [], blocks: [], payments: [], vouchers: [], reminders: [] }), update: async (fn) => fn({ bookings: [], blocks: [], payments: [], vouchers: [], reminders: [] }) }
  await withApi({ adminToken: 'dev-admin-token' }, async ({ call }) => {
    assert.equal((await call('GET', '/api/admin/bookings', undefined, { authorization: 'Bearer dev-admin-token' })).status, 401)
  }, { store: fakeStore, databaseUrl: 'postgres://x' })
})

test('elárasztás (OAT-021): a fizetetlen, időpontot fogva tartó foglalások száma felülről korlátos', async () => {
  await withApi({ depositPercent: 30, maxPendingHolds: 3, minFormMs: 0, createPerHour: 100, createPerDay: 100 }, async ({ call, logs }) => {
    const slots = [['2026-11-24', '09:00'], ['2026-11-24', '11:30'], ['2026-11-24', '14:00'], ['2026-11-25', '09:00']]
    const statuses = []
    for (const [i, [date, time]] of slots.entries()) {
      statuses.push((await call('POST', '/api/bookings', guest({ phone: `+36 30 000 00${10 + i}`, email: `bot${i}@example.com`, startsAt: slotAt(date, time) }))).status)
    }
    assert.deepEqual(statuses, [201, 201, 201, 503])
    assert.ok(logs.some((line) => line.includes('elárasztás')))
  })
})

test('vendégkód-találgatás: 30 hibás próbálkozás után kizárás', async () => {
  await withApi({ trustProxy: true, minFormMs: 0 }, async ({ call }) => {
    const booking = await (await call('POST', '/api/bookings', guest({ startsAt: slotAt('2026-11-24', '09:00') }))).json()
    const ip = { 'cf-connecting-ip': '198.51.100.77' }
    for (let i = 0; i < 30; i++) assert.equal((await call('GET', `/api/bookings/${booking.id}`, undefined, { ...ip, 'x-manage-token': `rossz${i}` })).status, 404)
    assert.equal((await call('GET', `/api/bookings/${booking.id}`, undefined, { ...ip, 'x-manage-token': booking.manageToken })).status, 429)
    assert.equal((await call('GET', `/api/bookings/${booking.id}`, undefined, { 'x-manage-token': booking.manageToken })).status, 200)
  })
})

test('nyílt átirányítás: csak a saját oldal útvonala alá lehet visszairányítani', async () => {
  await withApi({ depositPercent: 30, paymentProviders: ['demo'], demoPayments: true, publicUrl: 'https://site.test/app', apiUrl: 'http://api.test', minFormMs: 0 }, async ({ call, base }) => {
    const booking = await (await call('POST', '/api/bookings', guest({ startsAt: slotAt('2026-11-24', '09:00') }))).json()
    const path = new URL(booking.payment.checkoutUrl).pathname
    for (const evil of ['https://site.test/app.evil/', 'https://site.test/appx', 'https://site.test.evil.com/app/', '//evil.example/', 'javascript:alert(1)', 'https://site.test@evil.example/app/']) {
      const res = await fetch(`${base}${path}`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ card: '4000 0000 0000 0002', return: evil }) })
      const html = await res.text()
      assert.ok(!html.includes(evil.replace(/&/g, '&amp;')) || evil === 'https://site.test/app', `átengedett: ${evil}`)
    }
    const ok = await fetch(`${base}${path}`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ card: '4242424242424242', return: 'https://site.test/app/#/foglalas/x' }) })
    assert.equal(ok.headers.get('location'), 'https://site.test/app/#/foglalas/x')
    assert.match(ok.headers.get('content-security-policy') ?? (await fetch(`${base}${path}`)).headers.get('content-security-policy'), /frame-ancestors 'none'/)
  })
})

test('injekció és hibás bemenet: HTML/vezérlőkarakter a névben, hibás típusok, túl nagy kérés, rossz JSON', async () => {
  await withApi({ minFormMs: 0, createPerHour: 100 }, async ({ call, base }) => {
    const at = slotAt('2026-11-24', '09:00')
    assert.equal((await call('POST', '/api/bookings', guest({ name: '<script>alert(1)</script>', startsAt: at }))).status, 400)
    assert.equal((await call('POST', '/api/bookings', guest({ name: 'Anna\u0000Admin', startsAt: at }))).status, 400)
    assert.equal((await call('POST', '/api/bookings', guest({ name: { $ne: '' }, startsAt: at }))).status, 400)
    assert.equal((await call('POST', '/api/bookings', guest({ email: 'a"<b>@x.hu', startsAt: at }))).status, 400)
    assert.equal((await call('POST', '/api/bookings', guest({ email: ['a@b.hu'], startsAt: at }))).status, 400)
    assert.equal((await call('POST', '/api/bookings', guest({ __proto__: { admin: true }, startsAt: 'nem dátum' }))).status, 400)
    const big = await fetch(`${base}/api/bookings`, { method: 'POST', body: 'x'.repeat(70_000) })
    assert.equal(big.status, 413)
    const broken = await fetch(`${base}/api/bookings`, { method: 'POST', body: '{"name":' })
    assert.equal(broken.status, 400)
    // A megjegyzésből a HTML-jelek kikerülnek, a sortörés marad
    const ok = await call('POST', '/api/bookings', guest({ startsAt: at, note: 'Szia!\n<img src=x onerror=alert(1)>' }))
    assert.equal(ok.status, 201)
    const list = await (await call('GET', '/api/admin/bookings', undefined, { authorization: 'Bearer test-secret' })).json()
    assert.equal(list.bookings[0].customerNote, 'Szia!\nimg src=x onerror=alert(1)')
    assert.equal(list.bookings[0].manageToken, undefined) // az admin lista sem adja ki a vendég kódját
  })
})

test('biztonsági fejlécek minden válaszon, a hibaüzenet nem szivárogtat belső részleteket', async () => {
  await withApi({}, async ({ call }) => {
    for (const path of ['/health', '/api/catalog', '/nincs-ilyen', '/api/admin/bookings']) {
      const res = await call('GET', path)
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path)
      assert.equal(res.headers.get('cache-control'), 'no-store', path)
      assert.match(res.headers.get('content-security-policy'), /default-src 'none'/, path)
      assert.equal(res.headers.get('x-frame-options'), 'DENY', path)
      assert.match(res.headers.get('strict-transport-security'), /max-age=\d+/, path)
    }
  })
  // Belső hiba: a válaszban nincs stack trace
  const failing = { read: async () => { throw new Error('titkos belső részlet') }, update: async () => { throw new Error('titkos belső részlet') } }
  await withApi({}, async ({ call }) => {
    const res = await call('GET', '/api/availability?serviceId=gel-egyszinu&from=2026-11-24&to=2026-11-24')
    const text = await res.text()
    assert.equal(res.status, 500)
    assert.ok(!text.includes('titkos') && !text.includes('at '), text)
  }, { store: failing })
})

test('Slowloris: a félbehagyott fejlécű kapcsolatot a szerver bontja', async () => {
  // A valódi server.js beállításait használjuk (headersTimeout), itt rövidítve
  const app = createApp({ dataFile: join(tmpdir(), `nails-slow-${process.pid}.json`), adminToken: 'x', log: { info() {}, error() {} } })
  const server = createServer({ maxHeaderSize: 16 * 1024, connectionsCheckingInterval: 200 }, app)
  server.headersTimeout = 1000; server.requestTimeout = 1500
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const closed = await new Promise((resolve) => {
    const socket = connect(server.address().port, '127.0.0.1', () => socket.write('GET /health HTTP/1.1\r\nHost: x\r\n')) // a fejléc vége soha nem jön
    const timer = setTimeout(() => { socket.destroy(); resolve(false) }, 6000)
    socket.on('data', () => {})
    socket.on('close', () => { clearTimeout(timer); resolve(true) })
    socket.on('error', () => {})
  })
  server.closeAllConnections?.()
  await new Promise((resolve) => server.close(resolve))
  assert.equal(closed, true)
})

test('korlátozó: memóriabiztos sok hamis kulcs mellett is', () => {
  const limiter = createLimiter({ windowMs: 60_000, max: 2, maxKeys: 1000 })
  for (let i = 0; i < 20_000; i++) limiter.hit(`10.${i}`, 1_000)
  assert.ok(limiter.size() <= 1000, String(limiter.size()))
  assert.equal(limiter.hit('a', 1_000), false)
  assert.equal(limiter.hit('a', 1_001), false)
  assert.equal(limiter.hit('a', 1_002), true)
  assert.equal(limiter.hit('a', 70_000), false) // az ablak lejárt
})

test('admin eszközök: párosító kóddal saját kulcs, egyszer használatos kód, letiltás azonnal hat', async () => {
  await withApi({ trustProxy: true }, async ({ call }) => {
    const master = { authorization: 'Bearer test-secret' }
    // Mesterkulccsal párosító kód kérése
    const { code, expiresAt } = await (await call('POST', '/api/admin/devices/pairing', {}, master)).json()
    assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    assert.ok(expiresAt)
    // Kisbetűvel, kötőjel nélkül is elfogadja
    const paired = await call('POST', '/api/devices/pair', { code: code.toLowerCase().replace('-', ''), name: 'Pixel <b>8</b>' })
    assert.equal(paired.status, 201)
    const { token, name } = await paired.json()
    assert.equal(name, 'Pixel b8/b')
    assert.ok(token.length >= 40)
    const device = { authorization: `Bearer ${token}` }
    assert.deepEqual(await (await call('GET', '/api/admin/whoami', undefined, device)).json(), { kind: 'device', deviceId: (await (await call('GET', '/api/admin/devices', undefined, master)).json()).devices[0].id, name: 'Pixel b8/b' })
    assert.equal((await call('GET', '/api/admin/bookings', undefined, device)).status, 200)
    // Ugyanaz a kód másodszor már nem jó
    assert.equal((await call('POST', '/api/devices/pair', { code, name: 'Támadó' }, { 'cf-connecting-ip': '198.51.100.40' })).status, 400)
    // Eszközről új kód, második eszköz
    const second = await (await call('POST', '/api/admin/devices/pairing', {}, device)).json()
    const other = await (await call('POST', '/api/devices/pair', { code: second.code, name: 'Tablet' })).json()
    const list = (await (await call('GET', '/api/admin/devices', undefined, device)).json()).devices
    assert.equal(list.length, 2)
    assert.equal(list.find((d) => d.name === 'Tablet').pairedBy, 'Pixel b8/b')
    assert.equal(list.find((d) => d.current).name, 'Pixel b8/b')
    assert.ok(list.every((d) => d.tokenHash === undefined)) // a lenyomat sem kerül ki
    // Letiltás: a tablet kulcsa azonnal érvénytelen
    assert.equal((await call('DELETE', `/api/admin/devices/${list.find((d) => d.name === 'Tablet').id}`, undefined, device)).status, 200)
    assert.equal((await call('GET', '/api/admin/bookings', undefined, { authorization: `Bearer ${other.token}`, 'cf-connecting-ip': '198.51.100.41' })).status, 401)
    // Kijelentkezés: a saját eszköz letiltása
    assert.equal((await call('DELETE', '/api/admin/devices/current', undefined, device)).status, 200)
    assert.equal((await call('GET', '/api/admin/bookings', undefined, { ...device, 'cf-connecting-ip': '198.51.100.42' })).status, 401)
  })
})

test('párosító kód: lejár 10 perc után; találgatás IP-nként 5 hiba után, globálisan 30 hiba után zárva', async () => {
  const clock = { now: new Date(START) }
  await withApi({ trustProxy: true }, async ({ call }) => {
    const { code } = await (await call('POST', '/api/admin/devices/pairing', {}, { authorization: 'Bearer test-secret' })).json()
    clock.now = new Date(Date.parse(START) + 11 * 60_000)
    assert.equal((await call('POST', '/api/devices/pair', { code, name: 'Késő' })).status, 400)
    const attacker = { 'cf-connecting-ip': '198.51.100.50' }
    for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/devices/pair', { code: `AAAA-AAA${i}` }, attacker)).status, 400)
    assert.equal((await call('POST', '/api/devices/pair', { code: 'AAAA-BBBB' }, attacker)).status, 429)
    // Elosztott találgatás sok IP-ről: 30 hiba után mindenkinek zárva
    for (let i = 0; i < 25; i++) await call('POST', '/api/devices/pair', { code: 'ZZZZ-ZZZZ' }, { 'cf-connecting-ip': `198.51.101.${i}` })
    assert.equal((await call('POST', '/api/devices/pair', { code: 'ZZZZ-ZZZZ' }, { 'cf-connecting-ip': '198.51.102.1' })).status, 429)
  }, { now: () => clock.now })
})
