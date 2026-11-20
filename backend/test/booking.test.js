import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { createApp } from '../src/app.js'
import { createPgStore } from '../src/store-pg.js'
import { slotsForDate, zonedToUtc } from '../src/time.js'

// Hétfő 2026-11-23, 09:00 helyi idő; a foglalások a következő napokra szólnak
const START = '2026-11-23T08:00:00.000Z'

async function withApi(options, run) {
  const dir = await mkdtemp(join(tmpdir(), 'nails-api-'))
  const clock = { current: new Date(START) }
  // TEST_DATABASE_URL esetén ugyanezek a tesztek Postgresen futnak, tesztenként külön, utána törölt táblában
  const pgStore = process.env.TEST_DATABASE_URL ? createPgStore(process.env.TEST_DATABASE_URL, { table: `nbe_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}` }) : null
  const app = createApp({ dataFile: join(dir, 'db.json'), ...(pgStore ? { store: pgStore } : {}), adminToken: 'test-secret', now: () => clock.current, log: { info() {}, error() {} }, ...options })
  const server = createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const call = (method, path, body, headers = {}) => fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
  try { await run({ base, call, clock, app }) } finally {
    await new Promise((resolve) => server.close(resolve))
    await app.idle()
    if (pgStore) { await pgStore.drop(); await pgStore.close() }
    await rm(dir, { recursive: true, force: true })
  }
}

const admin = { authorization: 'Bearer test-secret' }
const guest = (overrides = {}) => ({ name: 'Teszt Vendég', phone: '+36 30 123 4567', email: 'vendeg@example.com', serviceId: 'gel-egyszinu', acceptedRules: true, ...overrides })
const slotAt = (date, time) => zonedToUtc(date, time, 'Europe/Budapest').toISOString()

test('időzóna: nyári és téli idő helyesen váltódik', () => {
  assert.equal(zonedToUtc('2026-11-24', '09:00', 'Europe/Budapest').toISOString(), '2026-11-24T08:00:00.000Z')
  assert.equal(zonedToUtc('2026-07-01', '09:00', 'Europe/Budapest').toISOString(), '2026-07-01T07:00:00.000Z')
})

test('szabad idősávok: munkaidőn belül, a szolgáltatás hosszával', () => {
  const config = { workingHours: { 2: [['09:00', '14:00']] }, slotStepMinutes: 30, bufferMinutes: 0, minLeadMinutes: 60, maxDaysAhead: 60, timezone: 'Europe/Budapest' }
  const slots = slotsForDate({ date: '2026-11-24', durationMinutes: 120, busy: [], config, now: new Date(START) })
  assert.deepEqual(slots.map((slot) => slot.time), ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00'])
  const withBusy = slotsForDate({ date: '2026-11-24', durationMinutes: 120, busy: [{ startsAt: slotAt('2026-11-24', '09:00'), endsAt: slotAt('2026-11-24', '11:00') }], config, now: new Date(START) })
  assert.equal(withBusy[0].time, '11:00')
})

test('foglalás: ütközés elutasítva, lemondás tokennel felszabadítja az időpontot', async () => withApi({}, async ({ call }) => {
  const availability = await (await call('GET', '/api/availability?serviceId=gel-egyszinu&from=2026-11-24&to=2026-11-24')).json()
  assert.ok(availability.days['2026-11-24'].includes('09:00'))
  const startsAt = slotAt('2026-11-24', '09:00')

  const first = await call('POST', '/api/bookings', guest({ startsAt }))
  assert.equal(first.status, 201)
  const booking = await first.json()
  assert.equal(booking.status, 'booked')
  assert.equal(booking.priceHuf, 5000)
  assert.ok(booking.manageToken)

  const clash = await call('POST', '/api/bookings', guest({ phone: '+36 20 222 3344', email: 'masik@example.com', startsAt }))
  assert.equal(clash.status, 409)

  assert.equal((await call('GET', `/api/bookings/${booking.id}`)).status, 404)
  assert.equal((await call('POST', `/api/bookings/${booking.id}/cancel`, { token: 'rossz' })).status, 404)
  assert.equal((await call('POST', `/api/bookings/${booking.id}/cancel`, { token: booking.manageToken })).status, 200)

  const again = await call('POST', '/api/bookings', guest({ phone: '+36 20 222 3344', email: 'masik@example.com', startsAt }))
  assert.equal(again.status, 201)
}))

test('munkaidőn kívüli, rácson kívüli és múltbeli időpont elutasítva', async () => withApi({}, async ({ call }) => {
  for (const startsAt of [slotAt('2026-11-24', '03:00'), slotAt('2026-11-24', '09:10'), slotAt('2026-11-22', '10:00'), slotAt('2026-11-24', '17:00')]) {
    assert.equal((await call('POST', '/api/bookings', guest({ startsAt }))).status, 409, startsAt)
  }
}))

test('egy vendég egyszerre legfeljebb 2 aktív foglalást tarthat', async () => withApi({}, async ({ call }) => {
  assert.equal((await call('POST', '/api/bookings', guest({ startsAt: slotAt('2026-11-24', '09:00') }))).status, 201)
  assert.equal((await call('POST', '/api/bookings', guest({ startsAt: slotAt('2026-11-25', '09:00') }))).status, 201)
  assert.equal((await call('POST', '/api/bookings', guest({ startsAt: slotAt('2026-11-26', '09:00') }))).status, 409)
}))

test('meg nem jelenés után teljes előrefizetés kell; késés esetén az előző díj is', async () => withApi({}, async ({ call }) => {
  const first = await (await call('POST', '/api/bookings', guest({ startsAt: slotAt('2026-11-24', '09:00') }))).json()
  assert.equal((await call('POST', `/api/admin/bookings/${first.id}/no-show`, { reason: 'late' }, admin)).status, 200)

  const next = await (await call('POST', '/api/bookings', guest({ phone: '06301234567', serviceId: 'epites-m', startsAt: slotAt('2026-11-26', '09:00') }))).json()
  assert.equal(next.status, 'pending_payment')
  assert.equal(next.amountDueHuf, 7000 + 5000)
  assert.equal(next.payment.provider, 'manual')
  assert.equal((await call('POST', `/api/bookings/${next.id}/confirm`, { token: next.manageToken })).status, 409)
  assert.equal((await call('POST', `/api/admin/bookings/${next.id}/payment-confirmed`, {}, admin)).status, 200)
  assert.equal((await call('POST', `/api/bookings/${next.id}/confirm`, { token: next.manageToken })).status, 200)

  // a díj rendezve: a következő foglalás ismét teljes árú előrefizetés (a no-show miatt), de felár nélkül
  await call('POST', `/api/admin/bookings/${next.id}/complete`, {}, admin)
  const third = await (await call('POST', '/api/bookings', guest({ startsAt: slotAt('2026-11-27', '09:00') }))).json()
  assert.equal(third.amountDueHuf, 5000)
}))

test('fizetésre váró foglalás lejáratkor felszabadítja az időpontot', async () => withApi({ config: { depositPercent: 30 } }, async ({ call, clock }) => {
  const startsAt = slotAt('2026-11-26', '09:00')
  const booking = await (await call('POST', '/api/bookings', guest({ startsAt }))).json()
  assert.equal(booking.status, 'pending_payment')
  assert.equal(booking.amountDueHuf, 1500)
  assert.equal((await call('POST', '/api/bookings', guest({ phone: '+36 20 111 2222', email: 'b@example.com', startsAt }))).status, 409)
  clock.current = new Date(clock.current.getTime() + 25 * 3600_000) // kézi fizetésnél 24 órás a hold
  const view = await (await call('GET', `/api/bookings/${booking.id}?token=${booking.manageToken}`)).json()
  assert.equal(view.status, 'expired')
  assert.equal((await call('POST', '/api/bookings', guest({ phone: '+36 20 111 2222', email: 'b@example.com', startsAt }))).status, 201)
}))

test('Stripe: checkout létrejön, érvényes aláírású webhook véglegesíti, hamis elutasítva', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push([url, init])
    return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }), { status: 200 })
  }
  await withApi({ fetchImpl, config: { depositPercent: 30, paymentProviders: ['stripe'], stripe: { secretKey: 'sk_test', webhookSecret: 'whsec_test' } } }, async ({ call, base, app }) => {
    const booking = await (await call('POST', '/api/bookings', guest({ startsAt: slotAt('2026-11-24', '09:00') }))).json()
    assert.equal(booking.payment.provider, 'stripe')
    assert.equal(booking.payment.checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_test_1')
    const stripeCall = calls.find(([url]) => url.includes('api.stripe.com'))
    const form = new URLSearchParams(stripeCall[1].body)
    assert.equal(form.get('line_items[0][price_data][unit_amount]'), '150000')
    assert.equal(form.get('line_items[0][price_data][currency]'), 'huf')

    const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { client_reference_id: booking.payment.id, payment_status: 'paid', amount_total: 150000 } } })
    const t = Math.floor(Date.now() / 1000)
    const sign = (secret) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`
    const forged = await fetch(`${base}/api/payments/webhook/stripe`, { method: 'POST', headers: { 'stripe-signature': sign('rossz') }, body: payload })
    assert.equal(forged.status, 400)
    assert.equal((await (await call('GET', `/api/bookings/${booking.id}?token=${booking.manageToken}`)).json()).status, 'pending_payment')

    const ok = await fetch(`${base}/api/payments/webhook/stripe`, { method: 'POST', headers: { 'stripe-signature': sign('whsec_test') }, body: payload })
    assert.equal(ok.status, 200)
    const paid = await (await call('GET', `/api/bookings/${booking.id}?token=${booking.manageToken}`)).json()
    assert.equal(paid.status, 'booked')
    assert.equal(paid.paymentStatus, 'paid')
    // ismételt webhook nem okoz hibát
    assert.equal((await fetch(`${base}/api/payments/webhook/stripe`, { method: 'POST', headers: { 'stripe-signature': sign('whsec_test') }, body: payload })).status, 200)
    await app.idle()
  })
})

test('Barion: a visszahívás után az állapotot a Barion API-tól kérdezi le', async () => {
  let paymentRequestId
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/v2/Payment/Start')) {
      paymentRequestId = JSON.parse(init.body).PaymentRequestId
      return new Response(JSON.stringify({ PaymentId: 'barion-1', GatewayUrl: 'https://secure.test.barion.com/Pay?Id=barion-1' }), { status: 200 })
    }
    return new Response(JSON.stringify({ Status: 'Succeeded', PaymentRequestId: paymentRequestId, Total: 5000 }), { status: 200 })
  }
  await withApi({ fetchImpl, config: { paymentProviders: ['barion'], depositPercent: 100, barion: { posKey: 'pos', payee: 'shop@example.com', baseUrl: 'https://api.test.barion.com', gatewayUrl: 'x' } } }, async ({ call, base }) => {
    const booking = await (await call('POST', '/api/bookings', guest({ startsAt: slotAt('2026-11-24', '09:00') }))).json()
    assert.match(booking.payment.checkoutUrl, /barion/)
    assert.equal((await fetch(`${base}/api/payments/webhook/barion?paymentId=barion-1`)).status, 200)
    assert.equal((await (await call('GET', `/api/bookings/${booking.id}?token=${booking.manageToken}`)).json()).status, 'booked')
  })
})

test('ajándékutalvány: rendelés, adminnal igazolt fizetés után aktív, beváltható', async () => withApi({}, async ({ call }) => {
  assert.equal((await call('POST', '/api/vouchers', { amountHuf: 1234, buyerName: 'Vevő', buyerEmail: 'vevo@example.com' })).status, 400)
  const order = await (await call('POST', '/api/vouchers', { amountHuf: 15000, buyerName: 'Vevő Vera', buyerEmail: 'vevo@example.com', recipientName: 'Anya' })).json()
  assert.equal(order.status, 'pending_payment')
  assert.equal((await call('POST', `/api/admin/vouchers/${order.id}/redeem`, {}, admin)).status, 409)
  const active = await (await call('POST', `/api/admin/vouchers/${order.id}/payment-confirmed`, {}, admin)).json()
  assert.equal(active.status, 'active')
  assert.match(active.code, /^NBE-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  assert.equal((await call('POST', `/api/admin/vouchers/${order.id}/redeem`, {}, admin)).status, 200)
}))

test('admin blokk elveszi a szabad idősávokat; admin végpontok tokent kérnek', async () => withApi({}, async ({ call }) => {
  assert.equal((await call('GET', '/api/admin/bookings')).status, 401)
  assert.equal((await call('POST', '/api/admin/blocks', { date: '2026-11-24', reason: 'Szabadság' }, admin)).status, 201)
  const availability = await (await call('GET', '/api/availability?serviceId=gel-egyszinu&from=2026-11-24&to=2026-11-25')).json()
  assert.deepEqual(availability.days['2026-11-24'], [])
  assert.ok(availability.days['2026-11-25'].length > 0)
}))

test('Evelin e-mail értesítést kap új foglalásról és késői lemondásról (FormSubmit)', async () => {
  const calls = []
  const fetchImpl = async (...args) => { calls.push(args); return new Response('{"success":"true"}', { status: 200 }) }
  await withApi({ fetchImpl, formSubmitEmail: 'evelin@example.com' }, async ({ call, app, clock }) => {
    const booking = await (await call('POST', '/api/bookings', guest({ startsAt: slotAt('2026-11-24', '09:00') }))).json()
    await app.idle()
    assert.match(calls[0][0], /^https:\/\/formsubmit\.co\/ajax\//)
    assert.equal(JSON.parse(calls[0][1].body).service, 'Géllakk – Egyszínű géllakk')
    clock.current = new Date('2026-11-23T14:00:00.000Z') // 24 órán belül az időpont
    await call('POST', `/api/bookings/${booking.id}/cancel`, { token: booking.manageToken })
    await app.idle()
    assert.match(JSON.parse(calls[1][1].body)._subject, /Késői lemondás/)
  })
})

test('a böngésző dátumot és helyi időt küldhet; a szerver váltja át', async () => withApi({}, async ({ call }) => {
  const response = await call('POST', '/api/bookings', guest({ date: '2026-11-24', time: '09:00' }))
  assert.equal(response.status, 201)
  assert.equal((await response.json()).startsAt, '2026-11-24T08:00:00.000Z')
}))

test('Demó fizetés: rossz kártya elutasítva, a 4242-es véglegesíti az időpontot', async () => {
  await withApi({ config: { depositPercent: 30, paymentProviders: ['demo'], demoPayments: true, publicUrl: 'https://site.test/app', apiUrl: 'http://api.test' } }, async ({ call, base, app }) => {
    const booking = await (await call('POST', '/api/bookings', guest({ startsAt: slotAt('2026-11-24', '09:00') }))).json()
    assert.equal(booking.payment.provider, 'demo')
    const path = new URL(booking.payment.checkoutUrl).pathname
    const page = await fetch(`${base}${path}?return=${encodeURIComponent('https://site.test/app/#/x')}`)
    assert.equal(page.status, 200)
    const pay = (card, back = 'https://site.test/app/#/x') => fetch(`${base}${path}`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ card, return: back }) })
    assert.equal((await pay('4000 0000 0000 0002')).status, 200)
    assert.equal((await (await call('GET', `/api/bookings/${booking.id}?token=${booking.manageToken}`)).json()).status, 'pending_payment')
    const ok = await pay('4242 4242 4242 4242', 'https://evil.example/')
    assert.equal(ok.status, 303)
    assert.equal(ok.headers.get('location'), 'https://site.test/app') // idegen címre nem irányít át
    const paid = await (await call('GET', `/api/bookings/${booking.id}?token=${booking.manageToken}`)).json()
    assert.equal(paid.status, 'booked')
    assert.equal(paid.confirmationStatus, 'confirmed') // külön megerősítés nem kell
    await app.idle()
  })
})

test('Demó fizetés JSON végpont: elutasított és hibás kártya, a 4242 véglegesít, újra-hívás idempotens', async () => {
  await withApi({ config: { depositPercent: 30, paymentProviders: ['demo'], demoPayments: true, publicUrl: 'https://site.test/app', apiUrl: 'http://api.test' } }, async ({ call, base, app }) => {
    const booking = await (await call('POST', '/api/bookings', guest({ startsAt: slotAt('2026-11-24', '09:00') }))).json()
    const paymentId = new URL(booking.payment.checkoutUrl).pathname.split('/').pop()
    const pay = (id, card) => fetch(`${base}/api/payments/demo/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ card }) })
    const declined = await pay(paymentId, '4000 0000 0000 0002')
    assert.equal(declined.status, 402)
    assert.deepEqual(await declined.json(), { error: 'card_declined', message: 'A kártyát elutasították (teszt).' })
    const invalid = await pay(paymentId, '5555 5555 5555 4444')
    assert.equal(invalid.status, 402)
    assert.equal((await invalid.json()).error, 'card_invalid')
    assert.equal((await (await call('GET', `/api/bookings/${booking.id}?token=${booking.manageToken}`)).json()).status, 'pending_payment')
    const ok = await pay(paymentId, '4242 4242 4242 4242')
    assert.equal(ok.status, 200)
    assert.deepEqual(await ok.json(), { ok: true })
    const again = await pay(paymentId, '4000 0000 0000 0002')
    assert.equal(again.status, 200) // már kifizetett: idempotens
    const paid = await (await call('GET', `/api/bookings/${booking.id}?token=${booking.manageToken}`)).json()
    assert.equal(paid.status, 'booked')
    assert.equal((await fetch(`${base}/api/payments/demo/nincs-ilyen`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 404)
    await app.idle()
  })
})
