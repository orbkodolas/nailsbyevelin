import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { createApp } from '../src/app.js'

// Hétfő 2026-11-23, 10:00 helyi idő
const START = '2026-11-23T09:00:00.000Z'
const admin = { authorization: 'Bearer test-secret' }
const PUSH_TOKEN = 'fcm-token-aaaaaaaaaaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbb'

async function withApi(options, run) {
  const dir = await mkdtemp(join(tmpdir(), 'nails-chat-'))
  const clock = { current: new Date(START) }
  const sent = []
  const fcm = options.fcm === null ? null : { async send(token, data) { sent.push({ token, data }); return options.pushResult ?? 'sent' } }
  const app = createApp({ dataFile: join(dir, 'db.json'), adminToken: 'test-secret', now: () => clock.current, log: { info() {}, error() {} }, fcm, config: { ...options.config } })
  const server = createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, body: await res.json() }
  }
  try {
    if (options.registerToken !== false) assert.equal((await call('POST', '/api/admin/push-token', { token: PUSH_TOKEN }, admin)).status, 200)
    await run({ call, clock, app, sent })
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
    await app.idle()
    await rm(dir, { recursive: true, force: true })
  }
}
const start = (call, extra = {}) => call('POST', '/api/chat', { name: 'Lilla', email: 'lilla@example.com', message: 'Szia! Van szabad időpont pénteken?', ...extra })

test('chat: értesítés megy, Evelin válaszol, élő beszélgetés indul', async () => {
  await withApi({}, async ({ call, sent, app }) => {
    const created = await start(call)
    assert.equal(created.status, 201)
    assert.equal(created.body.status, 'waiting')
    assert.ok(created.body.deadline)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].token, PUSH_TOKEN)
    assert.equal(sent[0].data.categoryId, 'chat_request')
    assert.equal(sent[0].data.title, 'Lilla kérdezne')
    assert.equal(JSON.parse(sent[0].data.body).chatId, created.body.id)
    const guest = { 'x-chat-token': created.body.token }

    assert.equal((await call('GET', `/api/chat/${created.body.id}`, undefined, { 'x-chat-token': 'rossz' })).status, 404)

    const reply = await call('POST', `/api/admin/chats/${created.body.id}/reply`, { text: 'Szia Lilla, igen, 14:00-kor!', clientId: 'n1' }, admin)
    assert.equal(reply.status, 201)
    assert.equal(reply.body.status, 'live')
    // Ugyanaz a válasz kétszer (értesítésből és appból) csak egyszer kerül be
    await call('POST', `/api/admin/chats/${created.body.id}/reply`, { text: 'Szia Lilla, igen, 14:00-kor!', clientId: 'n1' }, admin)

    const view = await call('GET', `/api/chat/${created.body.id}`, undefined, guest)
    assert.equal(view.body.status, 'live')
    assert.deepEqual(view.body.messages.map((m) => m.from), ['guest', 'evelin'])

    const more = await call('POST', `/api/chat/${created.body.id}/messages`, { text: 'Szuper, köszi!' }, guest)
    assert.equal(more.status, 201)
    await app.idle()
    assert.equal(sent.at(-1).data.categoryId, 'chat_reply')

    const list = await call('GET', '/api/admin/chats', undefined, admin)
    assert.equal(list.body.chats[0].unread, 1)
    assert.equal(list.body.chats[0].visitorOnline, true)

    const closed = await call('POST', `/api/admin/chats/${created.body.id}/close`, {}, admin)
    assert.equal(closed.body.status, 'closed')
    assert.equal((await call('POST', `/api/chat/${created.body.id}/messages`, { text: 'Még valami' }, guest)).status, 409)
  })
})

test('chat: 2 perc után e-mailes mód, utána Evelin egy ideig foglalt', async () => {
  await withApi({}, async ({ call, clock, app, sent }) => {
    const created = await start(call)
    clock.current = new Date(Date.parse(START) + 121_000)
    await app.tick()
    const view = await call('GET', `/api/chat/${created.body.id}`, undefined, { 'x-chat-token': created.body.token })
    assert.equal(view.body.status, 'missed')
    assert.equal(view.body.reason, 'timeout')
    assert.equal(sent.at(-1).data.channelId, 'chat_quiet')

    const next = await start(call, { email: 'masik@example.com' })
    assert.equal(next.body.status, 'missed')
    assert.equal(next.body.reason, 'busy')
    // Evelin feloldhatja a foglaltságot
    await call('POST', '/api/admin/chat-settings', { clearBusy: true }, admin)
    assert.equal((await start(call)).body.status, 'waiting')
  })
})

test('chat: elutasítás, kikapcsolt elérhetőség, csendes órák, nincs eszköz', async () => {
  await withApi({}, async ({ call, clock }) => {
    const created = await start(call)
    const declined = await call('POST', `/api/admin/chats/${created.body.id}/decline`, {}, admin)
    assert.equal(declined.body.status, 'missed')
    assert.equal(declined.body.reason, 'declined')
    await call('POST', '/api/admin/chat-settings', { clearBusy: true, available: false }, admin)
    assert.equal((await start(call)).body.reason, 'offline')
    await call('POST', '/api/admin/chat-settings', { available: true }, admin)
    clock.current = new Date('2026-11-23T22:30:00.000Z') // 23:30 helyi idő
    assert.equal((await start(call)).body.reason, 'quiet')
  })
  await withApi({ fcm: null, registerToken: true }, async ({ call }) => {
    assert.equal((await start(call)).body.reason, 'no_device')
  })
})

test('chat: lejárt kérdésre csak akkor lehet élőben válaszolni, ha a látogató még ott van', async () => {
  await withApi({}, async ({ call, clock, app }) => {
    const created = await start(call)
    clock.current = new Date(Date.parse(START) + 121_000)
    await app.tick()
    await call('GET', `/api/chat/${created.body.id}`, undefined, { 'x-chat-token': created.body.token }) // a látogató még az oldalon van
    const ok = await call('POST', `/api/admin/chats/${created.body.id}/reply`, { text: 'Bocsi, most értem ide!' }, admin)
    assert.equal(ok.body.status, 'live')
    const second = await start(call, { email: 'b@example.com' })
    await call('POST', `/api/admin/chats/${second.body.id}/decline`, {}, admin)
    clock.current = new Date(Date.parse(START) + 10 * 60_000)
    const gone = await call('POST', `/api/admin/chats/${second.body.id}/reply`, { text: 'Szia!' }, admin)
    assert.equal(gone.status, 409)
    assert.equal(gone.body.error, 'visitor_gone')
  })
})

test('chat: hosszú lekérdezés azonnal visszatér Evelin válaszára', async () => {
  await withApi({}, async ({ call }) => {
    const created = await start(call)
    const waiting = call('GET', `/api/chat/${created.body.id}?after=${created.body.seq}&wait=1`, undefined, { 'x-chat-token': created.body.token })
    await new Promise((resolve) => setTimeout(resolve, 100))
    await call('POST', `/api/admin/chats/${created.body.id}/reply`, { text: 'Itt vagyok!' }, admin)
    const result = await waiting
    assert.equal(result.body.status, 'live')
    assert.equal(result.body.messages.at(-1).text, 'Itt vagyok!')
  })
})

test('chat: érvénytelen adatok és érvénytelen push token törlése', async () => {
  await withApi({ pushResult: 'invalid_token' }, async ({ call, app }) => {
    assert.equal((await call('POST', '/api/chat', { name: '', email: 'a@b.hu', message: 'x' })).status, 400)
    assert.equal((await call('POST', '/api/chat', { name: 'Anna', email: 'nem-email', message: 'x' })).status, 400)
    assert.equal((await call('POST', '/api/chat', { name: 'Anna', email: 'a@b.hu', message: '  ' })).status, 400)
    assert.equal((await call('GET', '/api/admin/chats')).status, 401)
    const created = await start(call)
    assert.equal(created.body.reason, 'no_device')
    await app.idle()
    assert.deepEqual(await app.store.read((state) => state.pushTokens), [])
  })
})
