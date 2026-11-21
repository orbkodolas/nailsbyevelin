import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { createStore } from './store.js'
import { createPgStore } from './store-pg.js'
import { catalog, findService, services, publicRules } from './catalog.js'
import { loadConfig } from './config.js'
import { createPayments } from './payments.js'
import { createNotifier, formatDateTime } from './notify.js'
import { createFcm, parseServiceAccount } from './fcm.js'
import { createLiveChat } from './chat.js'
import { addDays, closedByRule, isDateString, isTime, localDate, localTime, overlaps, slotsForDate, zonedToUtc } from './time.js'
import { adminTokenMatches, cleanText, clientIp, createLimiter, HTML_CSP, isSafeName, sameSecret, setSecurityHeaders } from './security.js'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const INACTIVE = ['cancelled', 'rejected', 'expired', 'no_show', 'completed']
const VOUCHER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const json = (res, status, value, headers = {}) => {
  const body = JSON.stringify(value)
  // Nagy listáknál (admin foglalások) a gzip töredékére csökkenti a letöltést
  if (body.length > 2048 && /\bgzip\b/.test(res.req?.headers['accept-encoding'] ?? '')) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-encoding': 'gzip', vary: 'Accept-Encoding', ...headers })
    return res.end(gzipSync(body))
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers })
  res.end(body)
}
const html = (res, status, body) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': HTML_CSP }); res.end(body) }
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
function demoPage({ payment, back = '', error = '', message = '' }) {
  const amount = payment ? `${new Intl.NumberFormat('hu-HU').format(payment.amountHuf)} Ft` : ''
  return `<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demó fizetés</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1a0b12;font:16px/1.5 system-ui,sans-serif;color:#2a1119}
main{width:min(92vw,400px);background:#fdf5f2;border-radius:18px;padding:28px}h1{font:600 26px Georgia,serif;margin:0 0 4px}
.demo{background:#f6dfe3;border-radius:10px;padding:10px 12px;font-size:14px;margin:14px 0}
label{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin-top:14px}
input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #d6aab3;border-radius:10px;font-size:16px;background:#fff}
.row{display:flex;gap:10px}button{width:100%;margin-top:20px;padding:14px;border:0;border-radius:99px;background:#6b1d34;color:#fff;font-size:16px;cursor:pointer}
.err{color:#9b1c2e;margin-top:12px}a{color:#6b1d34}</style>
<main><h1>Nails by Evelin</h1>${message ? `<p>${esc(message)}</p>` : `<div>Fizetendő: <strong>${amount}</strong></div>
<div class="demo">Demó fizetés, nem történik valódi terhelés. Elfogadott kártya: <b>4242 4242 4242 4242</b>, bármilyen jövőbeli lejárat és CVC. Elutasított: 4000 0000 0000 0002.</div>
<form method="post"><input type="hidden" name="return" value="${esc(back)}">
<label>Kártyaszám<input name="card" inputmode="numeric" autocomplete="off" placeholder="4242 4242 4242 4242" value="4242 4242 4242 4242"></label>
<div class="row"><label>Lejárat<input name="exp" placeholder="12/30" value="12/30"></label><label>CVC<input name="cvc" placeholder="123" value="123"></label></div>
${error ? `<div class="err">${esc(error)}</div>` : ''}<button>Fizetés ${amount}</button></form><p><a href="${esc(back)}">Mégsem, vissza</a></p>`}</main></html>`
}
const httpError = (status, message) => Object.assign(new Error(message), { status })
const normalizePhone = (value) => {
  const compact = value.replace(/[\s().-]/g, '')
  if (compact.startsWith('0036')) return `+36${compact.slice(4)}`
  if (compact.startsWith('06')) return `+36${compact.slice(2)}`
  if (compact.startsWith('36')) return `+${compact}`
  return compact
}
const sameToken = sameSecret
const isEmail = (value) => typeof value === 'string' && value.length <= 254 && /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/.test(value)
const roundTo100 = (value) => Math.round(value / 100) * 100

async function readRaw(req) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 64_000) throw httpError(413, 'A kérés túl nagy.')
  }
  return body
}
async function readBody(req) {
  const raw = await readRaw(req)
  try { return JSON.parse(raw || '{}') } catch { throw httpError(400, 'Érvénytelen JSON.') }
}

export function createApp(options = {}) {
  const { dataFile = fileURLToPath(new URL('../data/bookings.json', import.meta.url)), fetchImpl = globalThis.fetch, now = () => new Date(), log = console } = options
  const config = loadConfig(process.env, {
    ...(options.adminToken ? { adminToken: options.adminToken } : {}),
    ...(options.formSubmitEmail ? { formSubmitEmail: options.formSubmitEmail } : {}),
    ...options.config,
  })
  // Adatbázis: DATABASE_URL (Neon/Postgres) esetén Postgres, különben a helyi JSON-fájl (fejlesztés, tesztek)
  const store = options.store ?? (options.databaseUrl ? createPgStore(options.databaseUrl, { log }) : createStore(dataFile))
  const payments = createPayments({ config, fetchImpl, now })
  const notifier = createNotifier({ config, fetchImpl, log })
  const pending = new Set()
  const background = (promise) => { const tracked = promise.catch(() => {}).finally(() => pending.delete(tracked)); pending.add(tracked) }
  const serviceAccount = parseServiceAccount(config.fcmServiceAccount)
  if (config.fcmServiceAccount && !serviceAccount) log.error?.('[push] FCM_SERVICE_ACCOUNT érvénytelen – értesítés nélkül fut a csevegés.')
  const fcm = options.fcm ?? (serviceAccount ? createFcm({ serviceAccount, fetchImpl, log }) : null)
  const liveChat = createLiveChat({ store, config, now, log, notifier, fcm, background, readBody, json })

  // ---------- védelem (OWASP API4/API6, OAT-021, NIST SP 800-63B-4) ----------
  // Foglalás/utalvány létrehozása IP-nként óránként és naponta korlátozva
  const createHourly = createLimiter({ windowMs: HOUR, max: config.createPerHour })
  const createDaily = createLimiter({ windowMs: DAY, max: config.createPerDay })
  // Sikertelen admin belépés: 10 hibás próbálkozás / 15 perc / IP, utána kizárás az ablak végéig
  const adminFailures = createLimiter({ windowMs: 15 * 60_000, max: config.adminMaxFailures })
  // Hibás vendég-kezelőkód (foglalás-azonosító + token találgatása)
  const tokenFailures = createLimiter({ windowMs: 15 * 60_000, max: 30 })
  const ipOf = (req) => clientIp(req, config.trustProxy).ip
  const rateLimited = (req) => {
    const ip = ipOf(req)
    const hourly = createHourly.hit(ip)
    const daily = createDaily.hit(ip)
    return hourly || daily
  }
  // Emberi kitöltés: az űrlap megnyitása és elküldése között legalább minFormMs telt el (bot-csapda a honeypot mellett)
  const looksAutomated = (body) => {
    if (body.website) return true
    if (config.minFormMs > 0 && !(Number.isFinite(body.formMs) && body.formMs >= config.minFormMs)) return true
    return false
  }
  // A kiszolgáló a saját PUBLIC_URL-jére irányíthat vissza; más (akár ugyanazon a GitHub-fiókon lévő) oldalra nem
  const publicBase = new URL(config.publicUrl)
  const isOwnUrl = (value) => {
    try {
      const target = new URL(value)
      const base = publicBase.pathname.replace(/\/$/, '')
      return target.origin === publicBase.origin && (target.pathname === base || target.pathname.startsWith(`${base}/`) || (!base && target.pathname.startsWith('/')))
    } catch { return false }
  }
  // ---------- admin eszközök ----------
  // Minden admin eszköz saját, véletlen kulcsot kap (256 bit); a szerver csak a SHA-256 lenyomatát tárolja.
  // Új eszköz egyszer használatos, 10 percig érvényes párosító kóddal léphet be; az eszközök egyenként letilthatók.
  const hashHex = (value) => createHash('sha256').update(String(value)).digest('hex')
  const normalizeCode = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const PAIRING_MS = 10 * 60_000
  const MAX_DEVICES = 10
  let deviceCache = null
  const activeDevices = async () => {
    if (deviceCache && Date.now() - deviceCache.at < 30_000) return deviceCache.list
    const list = await store.read((state) => (state.devices ?? []).filter((item) => !item.revokedAt))
    deviceCache = { at: Date.now(), list }
    return list
  }
  const seenWritten = new Map()
  // Párosító kód találgatása ellen: IP-nként 5 hibás kód / 15 perc, és globálisan 30 hibás kód / óra
  const pairFailures = createLimiter({ windowMs: 15 * 60_000, max: 5 })
  const pairFailuresGlobal = createLimiter({ windowMs: HOUR, max: 30 })
  async function issuePairing(createdBy) {
    const code = Array.from(randomBytes(8), (byte) => VOUCHER_ALPHABET[byte % VOUCHER_ALPHABET.length]).join('')
    const expiresAt = new Date(now().getTime() + PAIRING_MS).toISOString()
    await store.update((state) => {
      const nowIso = now().toISOString()
      state.pairings = (state.pairings ?? []).filter((item) => !item.usedAt && item.expiresAt > nowIso).slice(-4) // legfeljebb 5 élő kód
      state.pairings.push({ id: randomUUID(), codeHash: hashHex(code), expiresAt, createdAt: nowIso, createdBy })
    })
    return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt }
  }

  async function authenticateAdmin(header) {
    if (adminLocked) return null
    if (adminTokenMatches(header, config)) return { kind: 'master' }
    const match = /^Bearer ([\w-]{32,200})$/.exec(String(header || ''))
    if (!match) return null
    const digest = hashHex(match[1])
    const device = (await activeDevices()).find((item) => sameSecret(item.tokenHash, digest))
    if (!device) return null
    // Utolsó használat: óránként legfeljebb egyszer írjuk
    if (Date.now() - (seenWritten.get(device.id) ?? 0) > HOUR) {
      seenWritten.set(device.id, Date.now())
      background(store.update((state) => { const item = (state.devices ?? []).find((d) => d.id === device.id); if (item) item.lastSeenAt = now().toISOString() }))
    }
    return { kind: 'device', device }
  }

  // Fail-closed: éles adatbázissal nem fogadjuk el a fejlesztői alapkulcsot
  const adminLocked = Boolean(options.databaseUrl) && !config.adminTokenSha256 && config.adminToken === 'dev-admin-token'
  if (adminLocked) log.error?.('[biztonság] ADMIN_TOKEN nincs beállítva – az admin felület le van zárva.')

  const holds = (booking) => booking.status === 'booked' || (booking.status === 'pending_payment' && booking.holdExpiresAt > now().toISOString())
  // excludeId: időpont-módosításnál a foglalás saját, még régi helye nem számít foglaltnak
  const busyRanges = (state, excludeId) => [
    ...state.bookings.filter((item) => item.id !== excludeId && holds(item)),
    ...state.blocks,
  ]
  const slotsOn = (state, date, durationMinutes, excludeId) => slotsForDate({ date, durationMinutes, busy: busyRanges(state, excludeId), config, now: now(), openings: state.openings ?? [] })

  // Online módosítás: csak rögzített foglalásnál, a lemondási határidőn belül és korlátozott számban
  const rescheduleProblem = (booking) => {
    if (booking.status !== 'booked') return 'booking_not_active'
    if (Date.parse(booking.startsAt) - now().getTime() < config.lateCancelHours * HOUR) return 'too_late_to_reschedule'
    if ((booking.rescheduleCount || 0) >= config.maxReschedules) return 'reschedule_limit'
    return null
  }
  const rescheduleMessages = {
    booking_not_active: 'Ez a foglalás már nem módosítható.',
    too_late_to_reschedule: `Az időpont ${config.lateCancelHours} órán belül van, ezért online már nem módosítható. Kérlek, írj Evelinnek.`,
    reschedule_limit: `Az időpont legfeljebb ${config.maxReschedules} alkalommal módosítható online. Kérlek, írj Evelinnek.`,
    slot_unavailable: 'Ez az időpont már nem szabad. Válassz másikat.',
  }

  const publicBooking = (booking) => ({
    id: booking.id, status: booking.status === 'pending_payment' && booking.holdExpiresAt <= now().toISOString() ? 'expired' : booking.status, paymentStatus: booking.paymentStatus, confirmationStatus: booking.confirmationStatus,
    firstName: booking.name.split(' ')[0], serviceName: booking.serviceName, durationMinutes: booking.durationMinutes,
    startsAt: booking.startsAt, endsAt: booking.endsAt, priceHuf: booking.priceHuf, amountDueHuf: booking.amountDueHuf,
    amountPaidHuf: booking.amountPaidHuf, holdExpiresAt: booking.holdExpiresAt || null, lateCancellation: Boolean(booking.lateCancellation),
    canReschedule: rescheduleProblem(booking) === null,
  })

  const releaseBooking = (state, booking, status) => {
    booking.status = status
    for (const reminder of state.reminders) if (reminder.bookingId === booking.id && reminder.status === 'queued') reminder.status = 'cancelled'
    for (const payment of state.payments) if (payment.targetId === booking.id && ['created', 'pending'].includes(payment.status)) payment.status = status
  }

  // A hold lejárta: fizetésre váró foglalás elengedi az időpontot
  const expireHolds = (state) => {
    let changed = false
    for (const booking of state.bookings) {
      if (booking.status === 'pending_payment' && booking.holdExpiresAt <= now().toISOString()) { releaseBooking(state, booking, 'expired'); changed = true }
    }
    return changed
  }

  // Fizetés rögzítése (webhook vagy admin): idempotens
  function applyPaid(state, { kind, targetId }) {
    if (kind === 'voucher') {
      const voucher = state.vouchers.find((item) => item.id === targetId)
      if (!voucher || voucher.status !== 'pending_payment') return null
      voucher.status = 'active'
      voucher.paidAt = now().toISOString()
      const expires = new Date(now()); expires.setUTCMonth(expires.getUTCMonth() + catalog.voucher.validMonths)
      voucher.expiresAt = expires.toISOString()
      return { kind, voucher }
    }
    const booking = state.bookings.find((item) => item.id === targetId)
    if (!booking || booking.paymentStatus === 'paid') return null
    if (booking.status === 'expired') {
      const start = Date.parse(booking.startsAt); const end = Date.parse(booking.endsAt)
      const taken = busyRanges(state).some((item) => overlaps(start, end, Date.parse(item.startsAt), Date.parse(item.endsAt)))
      if (taken) { booking.paymentStatus = 'refund_needed'; return { kind, booking, refundNeeded: true } }
    } else if (booking.status !== 'pending_payment') {
      return null
    }
    booking.status = 'booked'
    booking.paymentStatus = 'paid'
    booking.amountPaidHuf = booking.amountDueHuf
    booking.confirmationStatus = 'confirmed' // a kifizetett foglaló egyben megerősítés is
    booking.confirmedAt = now().toISOString()
    booking.paidAt = now().toISOString()
    delete booking.holdExpiresAt
    for (const feeId of booking.feeBookingIds || []) {
      const fee = state.bookings.find((item) => item.id === feeId)
      if (fee) fee.feeSettled = true
    }
    return { kind, booking }
  }

  const afterPaid = (result) => {
    if (!result) return
    if (result.voucher) {
      background(notifier.voucherMail(result.voucher))
      background(notifier.notifyOwner(`Új ajándékutalvány – ${result.voucher.buyerName}`, { code: result.voucher.code, amount: result.voucher.amountHuf, buyer: result.voucher.buyerEmail }))
    } else if (result.booking && !result.refundNeeded) {
      background(notifier.guestBookingMail(result.booking))
      background(notifier.ownerBookingEvent(result.booking, 'paid'))
    } else if (result.booking) {
      background(notifier.notifyOwner(`Visszatérítés szükséges – ${result.booking.name}`, { booking: result.booking.id, reason: 'Fizetés a hold lejárta után érkezett, az időpont már foglalt.' }))
    }
  }

  // Szolgáltatói esemény (webhook vagy demó fizetés) rögzítése
  async function settle(providerId, event) {
    const settled = await store.update((state) => {
      const payment = state.payments.find((item) => (event.paymentId ? item.id === event.paymentId : item.orderRef === event.orderRef) && item.provider === providerId)
      if (!payment || ['paid', 'amount_mismatch'].includes(payment.status)) return null
      if (event.status === 'failed') { payment.status = 'failed'; return null }
      if (event.status !== 'paid') return null
      if (event.amountHuf !== undefined && event.amountHuf !== payment.amountHuf) { payment.status = 'amount_mismatch'; return null }
      payment.status = 'paid'; payment.paidAt = now().toISOString()
      return applyPaid(state, payment)
    })
    afterPaid(settled)
  }

  // Fizetés indítása a kiválasztott szolgáltatónál
  async function startPayment({ kind, targetId, providerId, description, customer, amountHuf, returnUrl }) {
    const provider = payments.get(providerId) || payments.get(payments.defaultProvider)
    const payment = { id: randomUUID(), provider: providerId, kind, targetId, amountHuf, description, status: 'created', createdAt: now().toISOString() }
    await store.update((state) => { state.payments.push(payment) })
    try {
      const checkout = await provider.createCheckout({ payment, customer, returnUrl })
      await store.update((state) => {
        const saved = state.payments.find((item) => item.id === payment.id)
        if (saved) Object.assign(saved, { status: 'pending', providerRef: checkout.providerRef, checkoutUrl: checkout.url, orderRef: checkout.orderRef })
      })
      return { id: payment.id, provider: providerId, amountHuf, checkoutUrl: checkout.url || null, instructions: checkout.instructions || null }
    } catch (error) {
      log.error?.(`[fizetés] ${providerId}: ${error.message} ${error.providerDetail || ''}`)
      await store.update((state) => { const saved = state.payments.find((item) => item.id === payment.id); if (saved) saved.status = 'error' })
      return { id: payment.id, provider: providerId, amountHuf, checkoutUrl: null, instructions: null, error: 'provider_unavailable' }
    }
  }

  const holdUntil = (providerId) => new Date(now().getTime() + (providerId === 'manual' ? config.manualHoldHours * HOUR : config.onlineHoldMinutes * 60_000)).toISOString()
  const bookingReturnUrl = (booking) => `${config.publicUrl}/#/foglalas/${booking.id}/${booking.manageToken}`

  // ---------- időzített feladatok ----------
  async function tick() {
    await liveChat.tick().catch((error) => log.error?.('[chat]', error))
    const changed = await store.update((state) => expireHolds(state))
    if (!notifier.mailEnabled) return { expired: changed }
    const due = await store.read((state) => state.reminders.filter((item) => item.status === 'queued' && item.dueAt <= now().toISOString()).map((item) => ({ ...item, booking: state.bookings.find((b) => b.id === item.bookingId) })))
    for (const reminder of due) {
      const { booking } = reminder
      let status = 'sent'
      if (!booking || booking.status !== 'booked' || !booking.email) status = 'skipped'
      else if (Date.parse(reminder.dueAt) < now().getTime() - 3 * HOUR) status = 'skipped'
      else if (await notifier.guestReminderMail(booking, reminder.kind) !== 'sent') status = 'queued'
      if (status !== 'queued') await store.update((state) => { const saved = state.reminders.find((item) => item.id === reminder.id); if (saved) { saved.status = status; saved.sentAt = now().toISOString() } })
    }
    return { expired: changed }
  }

  const availabilityRange = (url) => {
    const today = localDate(now(), config.timezone)
    const from = url.searchParams.get('from') || today
    const lastBookable = addDays(today, config.maxDaysAhead)
    const requestedTo = url.searchParams.get('to') || lastBookable
    if (!isDateString(from) || !isDateString(requestedTo) || requestedTo < from || requestedTo > addDays(from, 62)) return null
    return { from, to: requestedTo < lastBookable ? requestedTo : lastBookable }
  }
  const availabilityDays = (state, durationMinutes, { from, to }, excludeId) => {
    const result = {}
    for (let date = from; date <= to; date = addDays(date, 1)) result[date] = slotsOn(state, date, durationMinutes, excludeId).map((slot) => slot.time)
    return result
  }

  // ---------- kéréskezelő ----------
  async function app(req, res) {
    setSecurityHeaders(res)
    res.setHeader('access-control-allow-origin', config.corsOrigin)
    res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('access-control-allow-headers', 'content-type, authorization, x-manage-token, x-chat-token')
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

    const url = new URL(req.url, 'http://localhost')
    const path = url.pathname
    try {
      if (req.method === 'GET' && path === '/health') return json(res, 200, { ok: true, service: 'nailsbyevelin-api' })

      if (req.method === 'GET' && (path === '/api/catalog' || path === '/api/services')) {
        return json(res, 200, { ...catalog, services, rules: publicRules, timezone: config.timezone, depositPercent: config.depositPercent, emailEnabled: notifier.mailEnabled, paymentMethods: payments.list(), maxDaysAhead: config.maxDaysAhead, closedDays: config.closedDays })
      }

      if (req.method === 'GET' && path === '/api/availability') {
        const service = findService(url.searchParams.get('serviceId'))
        if (!service) return json(res, 400, { error: 'invalid_service' })
        const range = availabilityRange(url)
        if (!range) return json(res, 400, { error: 'invalid_range' })
        const days = await store.read((state) => availabilityDays(state, service.durationMinutes, range))
        return json(res, 200, { timezone: config.timezone, serviceId: service.id, durationMinutes: service.durationMinutes, days })
      }

      // ----- foglalás létrehozása -----
      if (req.method === 'POST' && path === '/api/bookings') {
        if (rateLimited(req)) return json(res, 429, { error: 'too_many_requests', message: 'Túl sok kérés. Próbáld újra később.' })
        const body = await readBody(req)
        if (looksAutomated(body)) return json(res, 400, { error: 'invalid_request', message: 'Nem sikerült elküldeni. Frissítsd az oldalt, és próbáld újra.' }) // honeypot + időcsapda
        const service = findService(body.serviceId)
        if (!service) return json(res, 400, { error: 'invalid_service', message: 'Válassz érvényes szolgáltatást.' })
        if (!isSafeName(body.name)) return json(res, 400, { error: 'invalid_name', message: 'Add meg a neved.' })
        if (typeof body.phone !== 'string' || normalizePhone(body.phone).length < 7 || normalizePhone(body.phone).length > 20) return json(res, 400, { error: 'invalid_phone', message: 'Érvénytelen telefonszám.' })
        if (!isEmail(body.email)) return json(res, 400, { error: 'invalid_email', message: 'Az e-mail cím kell a visszaigazoláshoz és az emlékeztetőhöz.' })
        if (body.acceptedRules !== true) return json(res, 400, { error: 'rules_acceptance_required', message: 'A házirend elfogadása szükséges.' })
        // A böngésző dátumot és helyi időt küld; az időzóna-átváltást a szerver végzi
        if (isDateString(body.date) && /^\d{2}:\d{2}$/.test(body.time || '')) body.startsAt = zonedToUtc(body.date, body.time, config.timezone).toISOString()
        if (typeof body.startsAt !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(body.startsAt) || !Number.isFinite(Date.parse(body.startsAt))) return json(res, 400, { error: 'invalid_start_time', message: 'Érvénytelen időpont.' })

        const start = new Date(body.startsAt)
        const end = new Date(start.getTime() + service.durationMinutes * 60_000)
        const phone = normalizePhone(body.phone)
        const email = body.email.trim().toLowerCase()
        const providerId = payments.get(body.paymentMethod) ? body.paymentMethod : payments.defaultProvider
        const manageToken = randomBytes(18).toString('base64url')

        const result = await store.update((state) => {
          expireHolds(state)
          const date = localDate(start, config.timezone)
          if (!slotsOn(state, date, service.durationMinutes).some((slot) => slot.time === localTime(start, config.timezone) && slot.startsAt === start.toISOString())) return { error: 'slot_unavailable' }
          const mine = (item) => item.phone === phone || item.email === email
          const active = state.bookings.filter((item) => mine(item) && holds(item) && item.endsAt > now().toISOString())
          if (active.length >= config.maxActiveBookingsPerGuest) return { error: 'too_many_bookings' }
          // OAT-021: egyszerre legfeljebb ennyi fizetetlen, időpontot fogva tartó foglalás lehet (elárasztás ellen)
          const unpaidHolds = state.bookings.filter((item) => item.status === 'pending_payment' && item.holdExpiresAt > now().toISOString()).length
          if (unpaidHolds >= config.maxPendingHolds) return { error: 'holds_exhausted' }

          const strikes = state.bookings.filter((item) => mine(item) && item.status === 'no_show')
          const unsettled = strikes.filter((item) => item.noShowReason === 'late' && !item.feeSettled)
          const feeHuf = unsettled.reduce((sum, item) => sum + item.priceHuf, 0)
          const deposit = config.depositPercent > 0 ? roundTo100(service.priceHuf * config.depositPercent / 100) : 0
          const amountDueHuf = strikes.length ? service.priceHuf + feeHuf : deposit
          const needsPayment = amountDueHuf > 0
          const booking = {
            id: randomUUID(), manageToken, name: body.name.trim(), phone, email,
            serviceId: service.id, serviceName: service.name, durationMinutes: service.durationMinutes, priceHuf: service.priceHuf,
            startsAt: start.toISOString(), endsAt: end.toISOString(),
            status: needsPayment ? 'pending_payment' : 'booked',
            paymentStatus: needsPayment ? 'required' : 'not_required',
            paymentReason: strikes.length ? 'prepay_after_strike' : deposit ? 'deposit' : null,
            amountDueHuf, amountPaidHuf: 0, feeBookingIds: unsettled.map((item) => item.id),
            holdExpiresAt: needsPayment ? holdUntil(providerId) : undefined,
            confirmationStatus: 'awaiting', acceptedRulesAt: now().toISOString(), createdAt: now().toISOString(),
            customerNote: cleanText(body.note, 1000),
          }
          state.bookings.push(booking)
          for (const [kind, offset] of [['day_before', DAY], ['two_hours_before', 2 * HOUR]]) {
            const dueAt = start.getTime() - offset
            if (dueAt > now().getTime()) state.reminders.push({ id: randomUUID(), bookingId: booking.id, kind, dueAt: new Date(dueAt).toISOString(), status: 'queued' })
          }
          return { booking, strikes: strikes.length }
        })
        if (result.error === 'holds_exhausted') {
          log.error?.('[biztonság] elérte a fizetetlen foglalások felső korlátját – lehetséges elárasztás')
          return json(res, 503, { error: result.error, message: 'Most túl sok a függőben lévő foglalás. Próbáld újra kicsit később, vagy hívj minket.' })
        }
        if (result.error === 'too_many_bookings') return json(res, 409, { error: result.error, message: `Egyszerre legfeljebb ${config.maxActiveBookingsPerGuest} aktív foglalásod lehet.` })
        if (result.error) return json(res, 409, { error: result.error, message: 'Ez az időpont már nem szabad. Válassz másikat.' })

        const { booking } = result
        let payment = null
        if (booking.status === 'pending_payment') {
          payment = await startPayment({
            kind: 'booking', targetId: booking.id, providerId, amountHuf: booking.amountDueHuf, customer: { name: booking.name, email: booking.email },
            description: `Nails by Evelin – ${booking.serviceName}`, returnUrl: bookingReturnUrl(booking),
          })
        }
        background(notifier.ownerBookingEvent(booking, 'created'))
        // Fizetést igénylő foglalásnál a vendég levelét a fizetés rögzítése után küldjük (afterPaid)
        if (booking.status !== 'pending_payment') background(notifier.guestBookingMail(booking))
        const policy = booking.paymentReason === 'prepay_after_strike'
          ? 'A korábbi elmaradt alkalom miatt a teljes összeget előre kell fizetned az időpont rögzítéséhez.'
          : booking.status === 'pending_payment' ? 'Az időpont a fizetéssel rögzül.' : 'Az időpont rögzítve. Ha nem tudsz eljönni, a lenti linken mondd le.'
        return json(res, 201, { ...publicBooking(booking), manageToken, manageUrl: notifier.manageUrl(booking), payment, policy })
      }

      // ----- vendég: saját foglalás kezelése (token kell) -----
      const bookingRoute = path.match(/^\/api\/bookings\/([\w-]+)(?:\/(confirm|cancel|pay|reschedule|availability))?$/)
      if (bookingRoute && ((req.method === 'GET' && (!bookingRoute[2] || bookingRoute[2] === 'availability')) || (req.method === 'POST' && bookingRoute[2] && bookingRoute[2] !== 'availability'))) {
        const [, id, action] = bookingRoute
        const body = req.method === 'POST' ? await readBody(req) : {}
        const token = req.headers['x-manage-token'] || body.token || url.searchParams.get('token')
        if (tokenFailures.blocked(ipOf(req))) return json(res, 429, { error: 'too_many_requests' }, { 'retry-after': String(tokenFailures.retryAfter(ipOf(req))) })
        const found = await store.read((state) => state.bookings.find((item) => item.id === id))
        if (!found || !sameToken(token, found.manageToken)) { tokenFailures.hit(ipOf(req)); return json(res, 404, { error: 'not_found' }) }
        if (!action) return json(res, 200, publicBooking(found))

        if (action === 'availability') {
          const problem = rescheduleProblem(found)
          if (problem) return json(res, 409, { error: problem, message: rescheduleMessages[problem] })
          const range = availabilityRange(url)
          if (!range) return json(res, 400, { error: 'invalid_range' })
          const days = await store.read((state) => availabilityDays(state, found.durationMinutes, range, found.id))
          return json(res, 200, { timezone: config.timezone, serviceId: found.serviceId, durationMinutes: found.durationMinutes, days })
        }

        if (action === 'reschedule') {
          if (!isDateString(body.date) || !/^\d{2}:\d{2}$/.test(body.time || '')) return json(res, 400, { error: 'invalid_start_time', message: 'Érvénytelen időpont.' })
          const start = zonedToUtc(body.date, body.time, config.timezone)
          const result = await store.update((state) => {
            const booking = state.bookings.find((item) => item.id === id)
            const problem = rescheduleProblem(booking)
            if (problem) return { error: problem }
            const end = new Date(start.getTime() + booking.durationMinutes * 60_000)
            if (!slotsOn(state, body.date, booking.durationMinutes, booking.id).some((slot) => slot.time === body.time && slot.startsAt === start.toISOString())) return { error: 'slot_unavailable' }
            if (start.toISOString() === booking.startsAt) return { error: 'same_slot' }
            const previousStartsAt = booking.startsAt
            booking.rescheduledFrom = [...(booking.rescheduledFrom || []), { startsAt: previousStartsAt, endsAt: booking.endsAt, at: now().toISOString() }]
            booking.rescheduleCount = (booking.rescheduleCount || 0) + 1
            booking.startsAt = start.toISOString()
            booking.endsAt = end.toISOString()
            // Az emlékeztetők az új időponthoz igazodnak
            for (const reminder of state.reminders) if (reminder.bookingId === booking.id && reminder.status === 'queued') reminder.status = 'cancelled'
            for (const [kind, offset] of [['day_before', DAY], ['two_hours_before', 2 * HOUR]]) {
              const dueAt = start.getTime() - offset
              if (dueAt > now().getTime()) state.reminders.push({ id: randomUUID(), bookingId: booking.id, kind, dueAt: new Date(dueAt).toISOString(), status: 'queued' })
            }
            return { booking, previousStartsAt }
          })
          if (result.error === 'same_slot') return json(res, 409, { error: result.error, message: 'Ez már a jelenlegi időpontod. Válassz másikat.' })
          if (result.error) return json(res, 409, { error: result.error, message: rescheduleMessages[result.error] })
          background(notifier.ownerBookingEvent(result.booking, 'rescheduled', { previousWhen: formatDateTime(result.previousStartsAt, config.timezone) }))
          background(notifier.guestRescheduleMail(result.booking, result.previousStartsAt))
          return json(res, 200, publicBooking(result.booking))
        }

        if (action === 'pay') {
          if (found.status !== 'pending_payment' || found.holdExpiresAt <= now().toISOString()) return json(res, 409, { error: 'payment_not_required' })
          const providerId = payments.get(body.paymentMethod) ? body.paymentMethod : payments.defaultProvider
          const payment = await startPayment({ kind: 'booking', targetId: id, providerId, amountHuf: found.amountDueHuf, customer: { name: found.name, email: found.email }, description: `Nails by Evelin – ${found.serviceName}`, returnUrl: bookingReturnUrl(found) })
          return json(res, 200, { payment })
        }

        const result = await store.update((state) => {
          const booking = state.bookings.find((item) => item.id === id)
          if (action === 'confirm') {
            if (booking.status === 'pending_payment') return { error: 'payment_required' }
            if (booking.status !== 'booked') return { error: 'booking_not_active' }
            booking.confirmationStatus = 'confirmed'
            booking.confirmedAt = now().toISOString()
          } else {
            if (!['booked', 'pending_payment'].includes(booking.status)) return { error: 'booking_not_active' }
            booking.lateCancellation = Date.parse(booking.startsAt) - now().getTime() < config.lateCancelHours * HOUR
            booking.cancelledAt = now().toISOString()
            booking.cancelledBy = 'guest'
            if (booking.amountPaidHuf > 0) booking.refundStatus = 'review'
            releaseBooking(state, booking, 'cancelled')
          }
          return { booking }
        })
        if (result.error) return json(res, 409, { error: result.error })
        if (action === 'cancel') background(notifier.ownerBookingEvent(result.booking, result.booking.lateCancellation ? 'late_cancelled' : 'cancelled'))
        return json(res, 200, publicBooking(result.booking))
      }

      // ----- ajándékutalvány vásárlás -----
      if (req.method === 'POST' && path === '/api/vouchers') {
        if (rateLimited(req)) return json(res, 429, { error: 'too_many_requests' })
        const body = await readBody(req)
        if (looksAutomated(body)) return json(res, 400, { error: 'invalid_request', message: 'Nem sikerült elküldeni. Frissítsd az oldalt, és próbáld újra.' })
        const { minHuf, maxHuf } = catalog.voucher
        if (!Number.isInteger(body.amountHuf) || body.amountHuf < minHuf || body.amountHuf > maxHuf || body.amountHuf % 500 !== 0) return json(res, 400, { error: 'invalid_amount', message: `Az érték ${minHuf}–${maxHuf} Ft között, 500 Ft-os lépésekben adható meg.` })
        if (!isSafeName(body.buyerName)) return json(res, 400, { error: 'invalid_name', message: 'Add meg a neved.' })
        if (!isEmail(body.buyerEmail)) return json(res, 400, { error: 'invalid_email', message: 'Érvénytelen e-mail cím.' })
        const providerId = payments.get(body.paymentMethod) ? body.paymentMethod : payments.defaultProvider
        const voucher = await store.update((state) => {
          let code
          do {
            const pick = () => Array.from(randomBytes(4), (byte) => VOUCHER_ALPHABET[byte % VOUCHER_ALPHABET.length]).join('')
            code = `NBE-${pick()}-${pick()}`
          } while (state.vouchers.some((item) => item.code === code))
          const created = {
            id: randomUUID(), code, status: 'pending_payment', amountHuf: body.amountHuf,
            buyerName: body.buyerName.trim(), buyerEmail: body.buyerEmail.trim().toLowerCase(),
            recipientName: cleanText(body.recipientName, 100).trim(),
            message: cleanText(body.message, 300), createdAt: now().toISOString(),
          }
          state.vouchers.push(created)
          return created
        })
        const payment = await startPayment({
          kind: 'voucher', targetId: voucher.id, providerId, amountHuf: voucher.amountHuf, customer: { name: voucher.buyerName, email: voucher.buyerEmail },
          description: `Nails by Evelin ajándékutalvány – ${new Intl.NumberFormat('hu-HU').format(voucher.amountHuf)} Ft`, returnUrl: `${config.publicUrl}/#/utalvany/koszonjuk`,
        })
        return json(res, 201, { id: voucher.id, status: voucher.status, amountHuf: voucher.amountHuf, payment })
      }

      // ----- demó fizetőoldal (kamu kártya) -----
      const demoPay = path.match(/^\/demo-pay\/([\w-]+)$/)
      if (demoPay && config.demoPayments && ['GET', 'POST'].includes(req.method)) {
        const payment = (await store.update((state) => state.payments.find((item) => item.id === demoPay[1] && item.provider === 'demo'))) || null
        if (!payment) return html(res, 404, demoPage({ message: 'Ismeretlen fizetés.' }))
        const form = new URLSearchParams(req.method === 'POST' ? await readRaw(req) : '')
        const back = (form.get('return') || url.searchParams.get('return') || '')
        const safeBack = isOwnUrl(back) ? back : config.publicUrl
        if (req.method === 'GET') return html(res, 200, demoPage({ payment, back: safeBack }))
        const digits = (form.get('card') || '').replace(/\D/g, '')
        if (payment.status === 'paid' || digits === '4242424242424242') {
          await settle('demo', { paymentId: payment.id, status: 'paid', amountHuf: payment.amountHuf })
          res.writeHead(303, { location: safeBack }); return res.end()
        }
        const declined = digits === '4000000000000002'
        return html(res, 200, demoPage({ payment, back: safeBack, error: declined ? 'A kártyát elutasították (teszt).' : 'Demó módban csak a 4242 4242 4242 4242 kártya fogadható el.' }))
      }

      // ----- demó fizetés JSON végpont (beágyazott fizetőforma) -----
      const demoApi = path.match(/^\/api\/payments\/demo\/([\w-]+)$/)
      if (demoApi && req.method === 'POST') {
        const payment = config.demoPayments ? (await store.read((state) => state.payments.find((item) => item.id === demoApi[1] && item.provider === 'demo'))) : null
        if (!payment) return json(res, 404, { error: 'not_found' })
        if (payment.status === 'paid') return json(res, 200, { ok: true })
        const body = await readBody(req)
        const digits = String(body.card ?? '').replace(/\D/g, '')
        if (digits === '4000000000000002') return json(res, 402, { error: 'card_declined', message: 'A kártyát elutasították (teszt).' })
        if (digits !== '4242424242424242') return json(res, 402, { error: 'card_invalid', message: 'Demó módban csak a 4242 4242 4242 4242 kártya fogadható el.' })
        await settle('demo', { paymentId: payment.id, status: 'paid', amountHuf: payment.amountHuf })
        return json(res, 200, { ok: true })
      }

      // ----- fizetési szolgáltatók visszahívása -----
      const webhook = path.match(/^\/api\/payments\/webhook\/(\w+)$/)
      if (webhook && ['GET', 'POST'].includes(req.method)) {
        const provider = payments.get(webhook[1])
        if (!provider || webhook[1] === 'manual') return json(res, 404, { error: 'not_found' })
        const rawBody = req.method === 'POST' ? await readRaw(req) : ''
        const event = await provider.parseWebhook({ rawBody, headers: req.headers, query: url.searchParams })
        if (event.status === 'invalid') return json(res, 400, { error: 'invalid_signature' })
        if (event.paymentId || event.orderRef) {
          await settle(webhook[1], event)
        }
        const reply = provider.webhookReply?.(rawBody)
        return reply ? (res.writeHead(200, { 'content-type': 'application/json', ...reply.headers }), res.end(reply.body)) : json(res, 200, { ok: true })
      }

      // ----- élő csevegés (látogató) -----
      if (path === '/api/chat' || path.startsWith('/api/chat/')) {
        const handled = await liveChat.publicRoute(req, res, path, url, ipOf(req))
        if (handled !== false) return
      }

      // ===== admin =====
      // ----- új admin eszköz párosítása (nyilvános, de csak érvényes párosító kóddal) -----
      if (req.method === 'POST' && path === '/api/devices/pair') {
        const ip = ipOf(req)
        if (pairFailures.blocked(ip) || pairFailuresGlobal.blocked('all')) return json(res, 429, { error: 'too_many_requests' }, { 'retry-after': String(Math.max(pairFailures.retryAfter(ip), pairFailuresGlobal.retryAfter('all'))) })
        const body = await readBody(req)
        const codeHash = hashHex(normalizeCode(body.code))
        const token = randomBytes(32).toString('base64url')
        const result = await store.update((state) => {
          state.pairings ??= []; state.devices ??= []
          const nowIso = now().toISOString()
          state.pairings = state.pairings.filter((item) => !item.usedAt && item.expiresAt > nowIso) // lejártak/felhasználtak törlése
          const pairing = state.pairings.find((item) => sameSecret(item.codeHash, codeHash))
          if (!pairing) return { error: 'invalid_pairing_code' }
          if (state.devices.filter((item) => !item.revokedAt).length >= MAX_DEVICES) return { error: 'too_many_devices' }
          pairing.usedAt = nowIso
          const device = { id: randomUUID(), name: cleanText(body.name, 60).trim() || 'Eszköz', tokenHash: hashHex(token), createdAt: nowIso, lastSeenAt: nowIso, pairedBy: pairing.createdBy }
          state.devices.push(device)
          return { device }
        })
        if (result.error === 'invalid_pairing_code') {
          pairFailures.hit(ip); pairFailuresGlobal.hit('all')
          log.error?.('[biztonság] hibás párosító kód')
          return json(res, 400, { error: result.error })
        }
        if (result.error) return json(res, 409, { error: result.error })
        deviceCache = null
        log.info?.(`[biztonság] új admin eszköz párosítva: ${result.device.name}`)
        background(notifier.notifyOwner(`Új eszköz az admin appban – ${result.device.name}`, { eszkoz: result.device.name, ido: formatDateTime(result.device.createdAt, config.timezone), figyelem: 'Ha nem te voltál, tiltsd le az admin app Eszközök fülén.' }))
        return json(res, 201, { token, deviceId: result.device.id, name: result.device.name })
      }

      if (path.startsWith('/api/admin/')) {
        const ip = ipOf(req)
        // NIST SP 800-63B-4 3.2.2 / OWASP: a sikertelen próbálkozások száma korlátozott; kizárás alatt a helyes kulcs sem megy
        if (adminFailures.blocked(ip)) return json(res, 429, { error: 'too_many_requests' }, { 'retry-after': String(adminFailures.retryAfter(ip)) })
        req.admin = await authenticateAdmin(req.headers.authorization)
        if (!req.admin) {
          adminFailures.hit(ip)
          log.error?.(`[biztonság] sikertelen admin hitelesítés (${req.method} ${path})`)
          return json(res, 401, { error: 'admin_auth_required' })
        }
      }

      if (path.startsWith('/api/admin/chat') || path === '/api/admin/push-token') {
        const handled = await liveChat.adminRoute(req, res, path, url, req.admin)
        if (handled !== false) return
      }

      if (req.method === 'GET' && path === '/api/admin/whoami') {
        return json(res, 200, req.admin.kind === 'device' ? { kind: 'device', deviceId: req.admin.device.id, name: req.admin.device.name } : { kind: 'master' })
      }
      if (req.method === 'POST' && path === '/api/admin/devices/pairing') {
        return json(res, 201, await issuePairing(req.admin.kind === 'device' ? req.admin.device.name : 'mesterkulcs'))
      }
      if (req.method === 'GET' && path === '/api/admin/devices') {
        const currentId = req.admin.kind === 'device' ? req.admin.device.id : null
        const devices = await store.read((state) => (state.devices ?? []).filter((item) => !item.revokedAt))
        return json(res, 200, { devices: devices.map(({ id, name, createdAt, lastSeenAt, pairedBy }) => ({ id, name, createdAt, lastSeenAt, pairedBy, current: id === currentId })) })
      }
      const deviceRoute = path.match(/^\/api\/admin\/devices\/([\w-]+)$/)
      if (req.method === 'DELETE' && deviceRoute) {
        const id = deviceRoute[1] === 'current' && req.admin.kind === 'device' ? req.admin.device.id : deviceRoute[1]
        const revoked = await store.update((state) => {
          const item = (state.devices ?? []).find((d) => d.id === id && !d.revokedAt)
          if (!item) return false
          item.revokedAt = now().toISOString()
          return true
        })
        deviceCache = null
        if (revoked) log.info?.('[biztonság] admin eszköz letiltva')
        return revoked ? json(res, 200, { ok: true }) : json(res, 404, { error: 'not_found' })
      }

      // Diagnosztika az adminnak: melyik fejlécből jön a kliens-IP (a valódi IP-t a korlátozók ebből veszik)
      if (req.method === 'GET' && path === '/api/admin/security') {
        const { ip, source } = clientIp(req, config.trustProxy)
        return json(res, 200, {
          clientIp: ip, source, trustProxy: config.trustProxy, adminTokenHashed: Boolean(config.adminTokenSha256), demoPayments: config.demoPayments,
          limits: { createPerHour: config.createPerHour, createPerDay: config.createPerDay, maxPendingHolds: config.maxPendingHolds, minFormMs: config.minFormMs, adminMaxFailures: config.adminMaxFailures },
          tracked: { createHourly: createHourly.size(), adminFailures: adminFailures.size(), tokenFailures: tokenFailures.size() },
        })
      }

      if (req.method === 'GET' && path === '/api/admin/bookings') {
        // Gyors út: sima olvasás; írási tranzakció csak akkor, ha van lejárt fizetési határidő
        const hasExpired = (state) => state.bookings.some((item) => item.status === 'pending_payment' && item.holdExpiresAt <= now().toISOString())
        const build = (state) => {
          const strikes = state.bookings.filter((item) => item.status === 'no_show')
          // Vendégenként egyszer számoljuk (telefon+e-mail páronként), nem foglalásonként újra
          const counts = new Map()
          const countFor = (booking) => {
            const key = `${booking.phone}\u0000${booking.email}`
            if (!counts.has(key)) counts.set(key, strikes.filter((item) => item.phone === booking.phone || item.email === booking.email).length)
            return counts.get(key)
          }
          const bookings = state.bookings.toSorted((a, b) => a.startsAt.localeCompare(b.startsAt)).map((booking) => ({
            ...booking, manageToken: undefined, noShowCount: countFor(booking),
          }))
          return {
            bookings, blocks: state.blocks.toSorted((a, b) => a.startsAt.localeCompare(b.startsAt)),
            openings: (state.openings ?? []).toSorted((a, b) => a.date.localeCompare(b.date)),
            // Az admin app ebből tudja, mely nap zárt szabály szerint és mi a heti munkaidő
            schedule: { closedDays: config.closedDays, closeHolidays: config.closeHolidays !== false, workingHours: config.workingHours },
          }
        }
        const data = (await store.read((state) => (hasExpired(state) ? null : build(state))))
          ?? (await store.update((state) => { expireHolds(state); return build(state) }))
        return json(res, 200, data)
      }

      const adminBookingRoute = path.match(/^\/api\/admin\/bookings\/([\w-]+)\/(no-show|payment-confirmed|complete|cancel|refunded)$/)
      if (req.method === 'POST' && adminBookingRoute) {
        const [, id, action] = adminBookingRoute
        const body = await readBody(req)
        let applied = null
        const result = await store.update((state) => {
          const booking = state.bookings.find((item) => item.id === id)
          if (!booking) return { error: 'not_found' }
          if (action === 'no-show') {
            if (!['booked', 'pending_payment'].includes(booking.status)) return { error: 'booking_not_active' }
            booking.noShowReason = body.reason === 'late' ? 'late' : 'no_show'
            booking.noShowAt = now().toISOString()
            releaseBooking(state, booking, 'no_show')
          } else if (action === 'complete') {
            if (booking.status !== 'booked') return { error: 'booking_not_active' }
            // El nem kezdődött időpont nem jelölhető teljesítettnek
            if (Date.parse(booking.startsAt) > now().getTime()) return { error: 'not_started' }
            booking.status = 'completed'; booking.completedAt = now().toISOString()
          } else if (action === 'refunded') {
            // Az előleg visszautalása kézzel történik (banki utalás); itt csak megjelöljük, hogy megvolt
            if (booking.refundStatus !== 'review') return { error: 'refund_not_pending' }
            booking.refundStatus = 'refunded'; booking.refundedAt = now().toISOString()
          } else if (action === 'cancel') {
            if (!['booked', 'pending_payment'].includes(booking.status)) return { error: 'booking_not_active' }
            if (booking.amountPaidHuf > 0) booking.refundStatus = 'review'
            booking.cancelledAt = now().toISOString()
            booking.cancelledBy = 'admin'
            // Statisztikához: a sürgős szabadnap miatt lemondott (eldobott) időpontok külön számolhatók
            if (body.reason === 'urgent_block') booking.cancelReason = 'urgent_block'
            booking.lateCancellation = Date.parse(booking.startsAt) - now().getTime() < config.lateCancelHours * HOUR
            releaseBooking(state, booking, 'cancelled')
          } else {
            if (!['pending_payment', 'expired'].includes(booking.status) || !['required', 'refund_needed'].includes(booking.paymentStatus)) return { error: 'payment_not_required' }
            applied = applyPaid(state, { kind: 'booking', targetId: id })
            booking.paymentStatus = 'paid_manual'
            for (const payment of state.payments) if (payment.targetId === id && ['created', 'pending'].includes(payment.status)) payment.status = 'paid_manual'
          }
          return { booking }
        })
        if (result.error) return json(res, result.error === 'not_found' ? 404 : 409, { error: result.error })
        afterPaid(applied)
        return json(res, 200, { ...result.booking, manageToken: undefined })
      }

      if (req.method === 'POST' && path === '/api/admin/blocks') {
        const body = await readBody(req)
        let startsAt; let endsAt
        // date (+ toDate: több napos szabadság) egész napokra; date + start/end helyi időben egy napon belül; vagy startsAt/endsAt
        if (isDateString(body.date) && isTime(body.start) && isTime(body.end)) {
          startsAt = zonedToUtc(body.date, body.start, config.timezone); endsAt = zonedToUtc(body.date, body.end, config.timezone)
        } else if (isDateString(body.date)) {
          const last = body.toDate === undefined ? body.date : body.toDate
          if (!isDateString(last) || last < body.date || last > addDays(body.date, 366)) return json(res, 400, { error: 'invalid_range' })
          startsAt = zonedToUtc(body.date, '00:00', config.timezone); endsAt = zonedToUtc(addDays(last, 1), '00:00', config.timezone)
        } else { startsAt = new Date(body.startsAt); endsAt = new Date(body.endsAt) }
        if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) return json(res, 400, { error: 'invalid_range' })
        const reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : ''
        // Sürgős: foglalás alatti letiltás (force) vagy kifejezetten sürgősnek jelölt
        const block = { id: randomUUID(), startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), reason, urgent: body.force === true || body.urgent === true || /sürgős/i.test(reason) }
        // A foglalásokat ugyanabban a tranzakcióban nézzük, mint a mentést: az admin app listája közben elavulhatott
        const conflicts = await store.update((state) => {
          const found = state.bookings.filter((item) => holds(item) && item.startsAt < block.endsAt && item.endsAt > block.startsAt)
          if (!found.length || body.force === true) state.blocks.push(block)
          return found
        })
        if (conflicts.length && body.force !== true) {
          return json(res, 409, { error: 'block_has_bookings', bookings: conflicts.map((item) => ({ id: item.id, name: item.name, phone: item.phone, startsAt: item.startsAt })) })
        }
        return json(res, 201, block)
      }
      const blockRoute = path.match(/^\/api\/admin\/blocks\/([\w-]+)$/)
      if (req.method === 'DELETE' && blockRoute) {
        const removed = await store.update((state) => { const before = state.blocks.length; state.blocks = state.blocks.filter((item) => item.id !== blockRoute[1]); return before !== state.blocks.length })
        return removed ? json(res, 200, { ok: true }) : json(res, 404, { error: 'not_found' })
      }

      // ----- egyedi nyitás: zárt napon (ünnep, szünnap, munkaidőn kívüli nap) adott időszakban lehet foglalni -----
      if (req.method === 'POST' && path === '/api/admin/openings') {
        const body = await readBody(req)
        if (!isDateString(body.date) || !isTime(body.start) || !isTime(body.end) || body.end <= body.start) return json(res, 400, { error: 'invalid_range' })
        if (body.date < localDate(now(), config.timezone)) return json(res, 400, { error: 'invalid_range' })
        const opening = { id: randomUUID(), date: body.date, start: body.start, end: body.end, reason: closedByRule(body.date, config) ?? 'extra_day', createdAt: now().toISOString() }
        await store.update((state) => {
          state.openings = [...(state.openings ?? []).filter((item) => item.date !== body.date), opening]
        })
        return json(res, 201, opening)
      }
      const openingRoute = path.match(/^\/api\/admin\/openings\/([\w-]+)$/)
      if (req.method === 'DELETE' && openingRoute) {
        const removed = await store.update((state) => {
          const before = (state.openings ?? []).length
          state.openings = (state.openings ?? []).filter((item) => item.id !== openingRoute[1])
          return before !== state.openings.length
        })
        return removed ? json(res, 200, { ok: true }) : json(res, 404, { error: 'not_found' })
      }

      if (req.method === 'GET' && path === '/api/admin/vouchers') return json(res, 200, { vouchers: await store.read((state) => state.vouchers.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))) })
      const voucherRoute = path.match(/^\/api\/admin\/vouchers\/([\w-]+)\/(payment-confirmed|redeem)$/)
      if (req.method === 'POST' && voucherRoute) {
        const [, id, action] = voucherRoute
        let applied = null
        const result = await store.update((state) => {
          const voucher = state.vouchers.find((item) => item.id === id)
          if (!voucher) return { error: 'not_found' }
          if (action === 'redeem') {
            if (voucher.status !== 'active' || voucher.expiresAt < now().toISOString()) return { error: 'voucher_not_active' }
            voucher.status = 'redeemed'; voucher.redeemedAt = now().toISOString()
          } else {
            applied = applyPaid(state, { kind: 'voucher', targetId: id })
            if (!applied) return { error: 'payment_not_required' }
            for (const payment of state.payments) if (payment.targetId === id && ['created', 'pending'].includes(payment.status)) payment.status = 'paid_manual'
          }
          return { voucher }
        })
        if (result.error) return json(res, result.error === 'not_found' ? 404 : 409, { error: result.error })
        afterPaid(applied)
        return json(res, 200, result.voucher)
      }

      if (req.method === 'GET' && path === '/api/admin/reminders') {
        const dueOnly = url.searchParams.get('due') === '1'
        const reminders = await store.read((state) => state.reminders.filter((item) => item.status === 'queued' && (!dueOnly || item.dueAt <= now().toISOString())))
        return json(res, 200, { reminders })
      }
      if (req.method === 'POST' && path.startsWith('/api/admin/reminders/')) {
        const id = path.split('/').at(-1)
        const result = await store.update((state) => {
          const reminder = state.reminders.find((item) => item.id === id)
          if (!reminder) return { error: 'not_found' }
          if (reminder.status !== 'queued') return { error: 'reminder_not_queued' }
          reminder.status = 'sent'; reminder.sentAt = now().toISOString()
          return { reminder }
        })
        if (result.error) return json(res, result.error === 'not_found' ? 404 : 409, { error: result.error })
        return json(res, 200, result.reminder)
      }

      return json(res, 404, { error: 'not_found' })
    } catch (error) {
      if (!error.status) log.error?.(error)
      return json(res, error.status || 500, { error: error.status ? 'bad_request' : 'internal_error', message: error.status ? error.message : 'Szerverhiba.' })
    }
  }

  app.tick = tick
  app.idle = () => Promise.all([...pending])
  app.config = config
  app.store = store
  return app
}

export { services, publicRules }
