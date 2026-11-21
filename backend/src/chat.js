// Élő csevegés Evelinnel a weboldalról.
// A látogató keresztnévvel, e-mail-címmel és a kérdésével indítja; Evelin push-értesítést kap (FCM), amiből
// válaszolhat vagy elutasíthat. Ha 2 percen belül nem válaszol (vagy épp nem elérhető), a látogató azt az
// üzenetet kapja, hogy Evelin e-mailben válaszol, Evelin pedig e-mailt kap a kérdésről.
// A beszélgetések a memóriában élnek (egy szerverpéldány), és minden változás a tárba is kiíródik.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { cleanText, createLimiter, isSafeName, sameSecret } from './security.js'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const POLL_MS = 20_000 // hosszú lekérdezés (long-poll) legfeljebb ennyi ideig vár változásra
const ONLINE_MS = 45_000 // ennyin belüli lekérdezésnél a látogató még az oldalon van
const MAX_TEXT = 1000
const MAX_GUEST_MESSAGES = 60
const KEEP_DAYS = 60
const OPEN = ['waiting', 'live']

const hashHex = (value) => createHash('sha256').update(String(value)).digest('hex')
const isEmail = (value) => typeof value === 'string' && value.length <= 254 && /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/.test(value)
const hourFmt = new Map()
const localHour = (date, timeZone) => {
  if (!hourFmt.has(timeZone)) hourFmt.set(timeZone, new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }))
  return Number(hourFmt.get(timeZone).format(date)) % 24
}

export function createLiveChat({ store, config, now, log, notifier, fcm, background, readBody, json }) {
  const settings = { timeoutMs: config.chatTimeoutSeconds * 1000, busyMs: config.chatBusyMinutes * MINUTE, idleMs: config.chatIdleMinutes * MINUTE }
  const createLimit = createLimiter({ windowMs: HOUR, max: config.chatPerHour })
  const messageLimit = createLimiter({ windowMs: MINUTE, max: 20 })
  const chats = new Map()
  const seen = new Map() // chatId -> utolsó látogatói lekérdezés (ms)
  const waiters = new Map() // chatId -> Set<fn>
  const adminWaiters = new Set()
  const timers = new Map()
  let version = 1
  let loaded = null

  const nowMs = () => now().getTime()
  const iso = () => now().toISOString()
  const ready = () => (loaded ??= store.read((state) => state.chats ?? []).then((list) => {
    for (const chat of list) { chats.set(chat.id, chat); if (chat.status === 'waiting') schedule(chat) }
  }).catch((error) => { loaded = null; throw error }))

  // ---------- tárolás és értesítés a várakozó kéréseknek ----------
  function persist(chat) {
    const copy = structuredClone(chat)
    background(store.update((state) => {
      state.chats ??= []
      const index = state.chats.findIndex((item) => item.id === copy.id)
      if (index >= 0) state.chats[index] = copy
      else state.chats.push(copy)
    }))
  }
  function changed(chat) {
    chat.seq = (chat.seq ?? 0) + 1
    chat.updatedAt = iso()
    version++
    persist(chat)
    for (const wake of [...(waiters.get(chat.id) ?? []), ...adminWaiters]) wake()
  }
  function waitFor(set, res, ms) {
    return new Promise((resolve) => {
      const done = () => { clearTimeout(timer); set.delete(done); resolve() }
      const timer = setTimeout(done, ms)
      set.add(done)
      res.on('close', done)
    })
  }

  // ---------- beállítások (Evelin elérhetősége) ----------
  const readSettings = () => store.read((state) => ({ available: true, busyUntil: null, quietOverrideUntil: null, ...(state.settings ?? []).find((item) => item.id === 'chat') }))
  // Csendes órák (alap 22–8): ilyenkor Evelin alapból nem elérhető, de a kapcsolóval felülbírálhatja
  // a csendes időszak végéig (quietOverrideUntil)
  const isQuiet = () => {
    const [from, to] = config.chatQuietHours
    const hour = localHour(now(), config.timezone)
    return from !== to && (from > to ? hour >= from || hour < to : hour >= from && hour < to)
  }
  const quietEnd = () => {
    const to = config.chatQuietHours[1]
    const start = Math.floor(nowMs() / HOUR) * HOUR
    for (let i = 1; i <= 25; i++) { const t = start + i * HOUR; if (localHour(new Date(t), config.timezone) === to) return new Date(t).toISOString() }
    return new Date(nowMs() + 12 * HOUR).toISOString()
  }
  const overrideActive = (current) => Boolean(current.quietOverrideUntil && current.quietOverrideUntil > iso())
  const effectiveAvailable = (current) => current.available && (!isQuiet() || overrideActive(current))
  const writeSettings = (patch) => store.update((state) => {
    state.settings ??= []
    let item = state.settings.find((entry) => entry.id === 'chat')
    if (!item) { item = { id: 'chat', available: true, busyUntil: null }; state.settings.push(item) }
    Object.assign(item, patch)
    return { available: item.available, busyUntil: item.busyUntil, quietOverrideUntil: item.quietOverrideUntil ?? null }
  })

  // ---------- push ----------
  // Csak az aktív (le nem tiltott) admin eszközök tokenjeire küldünk; az érvénytelen tokeneket töröljük
  async function pushAll(data) {
    if (!fcm) return 0
    const tokens = await store.read((state) => {
      const revoked = new Set((state.devices ?? []).filter((item) => item.revokedAt).map((item) => item.id))
      return (state.pushTokens ?? []).filter((item) => !item.deviceId || !revoked.has(item.deviceId))
    })
    let sent = 0
    const invalid = []
    for (const item of tokens) {
      const result = await fcm.send(item.token, data, { ttlSeconds: Math.ceil(settings.timeoutMs / 1000) })
      if (result === 'sent') sent++
      else if (result === 'invalid_token') invalid.push(item.id)
    }
    if (invalid.length) background(store.update((state) => { state.pushTokens = (state.pushTokens ?? []).filter((item) => !invalid.includes(item.id)) }))
    return sent
  }
  const pushData = (chat, extra) => ({ tag: `chat-${chat.id}`, body: JSON.stringify({ chatId: chat.id }), color: '#d7a2aa', ...extra })
  const shorten = (text, max = 300) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
  const quietPush = (chat, title, message) => background(pushAll(pushData(chat, { title, message, channelId: 'chat_quiet' })))

  // ---------- állapotváltások ----------
  function schedule(chat) {
    clearTimeout(timers.get(chat.id))
    const timer = setTimeout(() => { timers.delete(chat.id); expire().catch(() => {}) }, Math.max(0, Date.parse(chat.deadline) - nowMs()) + 250)
    timer.unref?.()
    timers.set(chat.id, timer)
  }

  /** Evelin nem fogadta (lejárt, elutasította vagy nem elérhető): a látogató e-mailes választ kap. */
  function miss(chat, reason) {
    clearTimeout(timers.get(chat.id))
    chat.status = 'missed'
    chat.reason = reason
    chat.missedAt = iso()
    delete chat.deadline
    changed(chat)
    const question = chat.messages.filter((item) => item.from === 'guest').map((item) => item.text).join('\n\n')
    background(notifier.notifyOwner(`Kérdés a weboldalról – ${chat.name}`, {
      nev: chat.name, email: chat.email, kerdes: question,
      teendo: `Válaszolj e-mailben erre a címre: ${chat.email}`,
    }))
    background(notifier.sendMail({
      to: chat.email, subject: 'Megkaptam a kérdésed – Nails by Evelin',
      text: [`Szia ${chat.name}!`, '', 'Köszönöm, hogy írtál! Most nem tudtam élőben válaszolni, de megkaptam a kérdésed, és hamarosan e-mailben jelentkezem.', '', `A kérdésed:\n${question}`, '', 'Szeretettel,\nEvelin'].join('\n'),
    }))
    return chat
  }

  async function expire() {
    await ready()
    const nowIso = iso()
    let busy = false
    for (const chat of chats.values()) {
      if (chat.status === 'waiting' && chat.deadline && chat.deadline <= nowIso) {
        miss(chat, 'timeout')
        busy = true
        quietPush(chat, `Nem fogadott kérdés: ${chat.name}`, `Válaszolj neki e-mailben: ${chat.email}`)
      }
    }
    // Lejárt a 2 perc: Evelin egy ideig „foglalt”, az új kérdések egyből e-mailes módba mennek
    if (busy && settings.busyMs > 0) await writeSettings({ busyUntil: new Date(nowMs() + settings.busyMs).toISOString() })
  }

  /** Miért nem tud most Evelin élőben válaszolni (null = elérhető). */
  async function unavailableReason() {
    const current = await readSettings()
    if (!current.available) return 'offline'
    if (current.busyUntil && current.busyUntil > iso()) return 'busy'
    if (isQuiet() && !overrideActive(current)) return 'quiet'
    const t = nowMs()
    const withGuest = await store.read((state) => state.bookings.some((item) => item.status === 'booked' && Date.parse(item.startsAt) <= t && t < Date.parse(item.endsAt)))
    return withGuest ? 'with_guest' : null
  }

  async function tick() {
    await ready()
    await expire()
    const nowIso = iso()
    const idleBefore = new Date(nowMs() - settings.idleMs).toISOString()
    const dropBefore = new Date(nowMs() - KEEP_DAYS * 24 * HOUR).toISOString()
    for (const chat of [...chats.values()]) {
      const last = chat.messages.at(-1)?.at ?? chat.createdAt
      if (chat.status === 'live' && last < idleBefore) { chat.status = 'closed'; chat.closedBy = 'idle'; chat.closedAt = nowIso; changed(chat) }
      if (chat.createdAt < dropBefore) {
        chats.delete(chat.id)
        background(store.update((state) => { state.chats = (state.chats ?? []).filter((item) => item.id !== chat.id) }))
      }
    }
  }

  // ---------- nézetek ----------
  const visitorOnline = (chat) => nowMs() - (seen.get(chat.id) ?? 0) < ONLINE_MS
  const publicView = (chat) => ({
    id: chat.id, status: chat.status, reason: chat.reason ?? null, name: chat.name, email: chat.email,
    deadline: chat.deadline ?? null, serverNow: iso(), closedBy: chat.closedBy ?? null, seq: chat.seq,
    messages: chat.messages.map(({ id, from, text, at }) => ({ id, from, text, at })),
  })
  const adminView = (chat) => ({
    id: chat.id, name: chat.name, email: chat.email, status: chat.status, reason: chat.reason ?? null,
    createdAt: chat.createdAt, updatedAt: chat.updatedAt, deadline: chat.deadline ?? null, closedBy: chat.closedBy ?? null,
    emailedAt: chat.emailedAt ?? null, readAt: chat.readAt ?? null, visitorOnline: OPEN.includes(chat.status) || chat.status === 'missed' ? visitorOnline(chat) : false,
    unread: chat.messages.slice(chat.readCount ?? 0).filter((item) => item.from === 'guest').length,
    messages: chat.messages.map(({ id, from, text, at }) => ({ id, from, text, at })),
  })
  async function adminList() {
    const list = [...chats.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100).map(adminView)
    const current = await readSettings()
    return { version, serverNow: iso(), settings: { available: effectiveAvailable(current), quiet: isQuiet(), busyUntil: current.busyUntil && current.busyUntil > iso() ? current.busyUntil : null }, chats: list }
  }

  const markRead = (chat) => { chat.readAt = iso(); chat.readCount = chat.messages.length }
  const guestMessage = (text) => ({ id: randomUUID(), from: 'guest', text, at: iso() })

  // ---------- nyilvános végpontok (látogató) ----------
  async function publicRoute(req, res, path, url, ip) {
    if (req.method === 'POST' && path === '/api/chat') {
      await ready()
      const body = await readBody(req)
      if (body.website) return json(res, 201, { id: randomUUID(), token: randomBytes(24).toString('base64url'), status: 'missed', reason: 'offline', messages: [] }) // honeypot: csendben elnyeljük
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const email = typeof body.email === 'string' ? body.email.trim() : ''
      const text = cleanText(body.message, MAX_TEXT).trim()
      if (!isSafeName(name, 2, 40)) return json(res, 400, { error: 'invalid_name', message: 'Add meg a keresztneved.' })
      if (!isEmail(email)) return json(res, 400, { error: 'invalid_email', message: 'Adj meg egy érvényes e-mail-címet.' })
      if (!text) return json(res, 400, { error: 'invalid_message', message: 'Írd le röviden a kérdésed.' })
      if (createLimit.hit(ip)) return json(res, 429, { error: 'too_many_requests', message: 'Túl sok kérdés érkezett innen. Próbáld újra később, vagy írj Facebookon.' })

      const token = randomBytes(24).toString('base64url')
      const chat = { id: randomUUID(), tokenHash: hashHex(token), name, email, status: 'waiting', createdAt: iso(), updatedAt: iso(), seq: 0, messages: [guestMessage(text)] }
      chats.set(chat.id, chat)
      seen.set(chat.id, nowMs())
      const reason = await unavailableReason()
      if (reason) {
        miss(chat, reason)
        quietPush(chat, `Új kérdés: ${chat.name}`, `${shorten(text, 120)} · Válaszolj e-mailben: ${chat.email}`)
      } else {
        const sent = await pushAll(pushData(chat, { title: `${name} kérdezne`, message: shorten(text), categoryId: 'chat_request', channelId: 'chat' }))
        if (!sent) miss(chat, 'no_device')
        else {
          // A 2 perc attól számít, hogy az értesítés elment Evelinnek
          chat.deadline = new Date(nowMs() + settings.timeoutMs).toISOString()
          chat.notifiedAt = iso()
          changed(chat)
          schedule(chat)
        }
      }
      log.info?.(`[chat] új kérdés (${chat.status}${chat.reason ? `, ${chat.reason}` : ''})`)
      return json(res, 201, { ...publicView(chat), token })
    }

    const route = path.match(/^\/api\/chat\/([\w-]+)(?:\/(messages|close))?$/)
    if (!route) return false
    await ready()
    const chat = chats.get(route[1])
    const token = String(req.headers['x-chat-token'] || '')
    if (!chat || !token || !sameSecret(chat.tokenHash, hashHex(token))) return json(res, 404, { error: 'not_found' })

    if (req.method === 'GET' && !route[2]) {
      seen.set(chat.id, nowMs())
      const after = Number(url.searchParams.get('after') ?? -1)
      if (url.searchParams.get('wait') === '1' && chat.seq <= after) {
        let set = waiters.get(chat.id)
        if (!set) waiters.set(chat.id, (set = new Set()))
        await waitFor(set, res, POLL_MS)
        if (!set.size) waiters.delete(chat.id)
        if (res.destroyed) return true
        seen.set(chat.id, nowMs())
      }
      return json(res, 200, publicView(chat))
    }
    if (req.method === 'POST' && route[2] === 'messages') {
      const body = await readBody(req)
      const text = cleanText(body.text, MAX_TEXT).trim()
      if (!text) return json(res, 400, { error: 'invalid_message' })
      if (!OPEN.includes(chat.status)) return json(res, 409, { error: 'chat_not_open', chat: publicView(chat) })
      if (messageLimit.hit(chat.id) || chat.messages.filter((item) => item.from === 'guest').length >= MAX_GUEST_MESSAGES) return json(res, 429, { error: 'too_many_requests', message: 'Túl sok üzenet. Várj egy kicsit.' })
      seen.set(chat.id, nowMs())
      chat.messages.push(guestMessage(text))
      changed(chat)
      const waiting = chat.status === 'waiting'
      background(pushAll(pushData(chat, { title: waiting ? `${chat.name} kérdezne` : chat.name, message: shorten(text), categoryId: waiting ? 'chat_request' : 'chat_reply', channelId: 'chat' })))
      return json(res, 201, publicView(chat))
    }
    if (req.method === 'POST' && route[2] === 'close') {
      if (OPEN.includes(chat.status)) {
        const wasWaiting = chat.status === 'waiting'
        clearTimeout(timers.get(chat.id))
        chat.status = 'closed'; chat.closedBy = 'guest'; chat.closedAt = iso(); delete chat.deadline
        changed(chat)
        if (wasWaiting) quietPush(chat, `${chat.name} visszavonta a kérdést`, 'Kilépett a csevegésből, mielőtt válaszoltál.')
      }
      return json(res, 200, publicView(chat))
    }
    return json(res, 405, { error: 'method_not_allowed' })
  }

  // ---------- admin végpontok (Evelin appja) ----------
  async function adminRoute(req, res, path, url, admin) {
    if (req.method === 'GET' && path === '/api/admin/chats') {
      await ready()
      const after = Number(url.searchParams.get('after') ?? 0)
      if (url.searchParams.get('wait') === '1' && version <= after) {
        await waitFor(adminWaiters, res, POLL_MS)
        if (res.destroyed) return true
      }
      return json(res, 200, await adminList())
    }
    if (req.method === 'POST' && path === '/api/admin/chat-settings') {
      const body = await readBody(req)
      const patch = {}
      if (typeof body.available === 'boolean') {
        // Csendes órákban a kapcsoló a felülbírálást kezeli; a nappali beállítás változatlan marad
        if (isQuiet()) { patch.quietOverrideUntil = body.available ? quietEnd() : null; if (body.available) patch.available = true }
        else { patch.available = body.available; patch.quietOverrideUntil = null }
      }
      if (body.clearBusy) patch.busyUntil = null
      await writeSettings(patch)
      version++
      for (const wake of adminWaiters) wake()
      return json(res, 200, (await adminList()).settings)
    }
    if (req.method === 'POST' && path === '/api/admin/push-token') {
      const body = await readBody(req)
      const token = typeof body.token === 'string' ? body.token.trim() : ''
      if (!/^[\w:.-]{20,4096}$/.test(token)) return json(res, 400, { error: 'invalid_token' })
      const id = hashHex(token).slice(0, 32)
      const deviceId = admin.kind === 'device' ? admin.device.id : null
      await store.update((state) => {
        state.pushTokens ??= []
        const nowIso = iso()
        const existing = state.pushTokens.find((item) => item.id === id)
        if (existing) Object.assign(existing, { deviceId, updatedAt: nowIso })
        // Eszközönként egy token: az app újratelepítésekor kapott új token lecseréli a régit
        else state.pushTokens = [...state.pushTokens.filter((item) => !deviceId || item.deviceId !== deviceId), { id, token, deviceId, platform: String(body.platform || 'android').slice(0, 20), createdAt: nowIso, updatedAt: nowIso }].slice(-10)
      })
      return json(res, 200, { ok: true })
    }

    const route = path.match(/^\/api\/admin\/chats\/([\w-]+)(?:\/(reply|decline|close|read|emailed))?$/)
    if (!route) return false
    await ready()
    const chat = chats.get(route[1])
    if (!chat) return json(res, 404, { error: 'not_found' })

    if (req.method === 'DELETE' && !route[2]) {
      clearTimeout(timers.get(chat.id))
      chats.delete(chat.id)
      version++
      for (const wake of adminWaiters) wake()
      background(store.update((state) => { state.chats = (state.chats ?? []).filter((item) => item.id !== chat.id) }))
      return json(res, 200, { ok: true })
    }
    if (req.method !== 'POST' || !route[2]) return json(res, 405, { error: 'method_not_allowed' })
    const body = await readBody(req)

    if (route[2] === 'reply') {
      const text = cleanText(body.text, MAX_TEXT).trim()
      if (!text) return json(res, 400, { error: 'invalid_message' })
      // Ugyanaz a válasz kétszer (értesítésből és az appból egyszerre) csak egyszer kerül be
      const clientId = typeof body.clientId === 'string' ? body.clientId.slice(0, 100) : ''
      if (clientId && chat.messages.some((item) => item.clientId === clientId)) return json(res, 200, adminView(chat))
      if (chat.status === 'closed') return json(res, 409, { error: 'chat_closed', chat: adminView(chat) })
      // Lejárt kérdésre csak akkor lehet élőben válaszolni, ha a látogató még az oldalon van
      if (chat.status === 'missed' && !visitorOnline(chat)) return json(res, 409, { error: 'visitor_gone', chat: adminView(chat) })
      if (chat.status !== 'live') {
        clearTimeout(timers.get(chat.id))
        chat.status = 'live'; chat.answeredAt = iso(); delete chat.deadline; delete chat.reason
      }
      chat.messages.push({ id: randomUUID(), from: 'evelin', text, at: iso(), ...(clientId ? { clientId } : {}) })
      markRead(chat)
      changed(chat)
      return json(res, 201, adminView(chat))
    }
    if (route[2] === 'decline') {
      if (chat.status === 'waiting') {
        miss(chat, 'declined')
        if (settings.busyMs > 0) await writeSettings({ busyUntil: new Date(nowMs() + settings.busyMs).toISOString() })
      }
      markRead(chat)
      return json(res, 200, adminView(chat))
    }
    if (route[2] === 'close') {
      if (OPEN.includes(chat.status)) {
        clearTimeout(timers.get(chat.id))
        chat.status = 'closed'; chat.closedBy = 'evelin'; chat.closedAt = iso(); delete chat.deadline
        changed(chat)
      }
      return json(res, 200, adminView(chat))
    }
    if (route[2] === 'read') { markRead(chat); changed(chat); return json(res, 200, adminView(chat)) }
    if (route[2] === 'emailed') { if (body.done === false) delete chat.emailedAt; else chat.emailedAt = iso(); markRead(chat); changed(chat); return json(res, 200, adminView(chat)) }
    return false
  }

  return { publicRoute, adminRoute, tick }
}
