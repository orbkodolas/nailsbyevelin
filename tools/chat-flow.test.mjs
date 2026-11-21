import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { createApp } from '../backend/src/app.js'

// A valódi böngészős API-klienssel ellenőrzi a teljes kört, bundler és külső szolgáltatások nélkül.
test('webes chat: a token több lekérdezésen, adminválaszon és üzenetküldésen át megmarad', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nbe-chat-flow-'))
  const app = createApp({ dataFile: join(dir, 'db.json'), adminToken: 'test-secret', fcm: null,
    now: () => new Date('2026-11-23T22:30:00Z'), log: { info() {}, error() {} } })
  const server = createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const source = (await readFile(new URL('../frontend/src/lib/api.ts', import.meta.url), 'utf8'))
      .replace(/import\.meta\.env\.VITE_API_URL \|\| `http:\/\/\$\{window\.location\.hostname\}:3001`/, JSON.stringify(base))
    const js = stripTypeScriptTypes(source)
    const api = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
    const created = await api.startLiveChat({ name: 'Teszt', email: 'test@example.com', message: 'Automatikus teszt', website: '' })
    assert.equal(created.status, 'missed')
    assert.equal(created.reason, 'quiet')
    const first = await api.getLiveChat(created.id, created.token)
    assert.equal(first.token, created.token)
    const waiting = api.getLiveChat(first.id, first.token, first.seq, true)
    const response = await fetch(`${base}/api/admin/chats/${first.id}/reply`, {
      method: 'POST', headers: { authorization: 'Bearer test-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Szia, itt vagyok!', clientId: 'regression-reply' }),
    })
    assert.equal(response.status, 201)
    const replied = await waiting
    assert.equal(replied.token, created.token)
    assert.equal(replied.status, 'live')
    assert.equal(replied.messages.at(-1).text, 'Szia, itt vagyok!')
    const sent = await api.sendLiveMessage(replied.id, replied.token, 'Köszönöm!')
    assert.equal(sent.token, created.token)
    const again = await api.getLiveChat(sent.id, sent.token)
    assert.equal(again.messages.at(-1).text, 'Köszönöm!')
    const closed = await api.closeLiveChat(again.id, again.token)
    assert.equal(closed.status, 'closed')
    assert.equal(closed.token, created.token)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await app.idle()
    await rm(dir, { recursive: true, force: true })
  }
})
