// Teszt-foglalások az adatbázisba (dummy: true jelöléssel, @example.com címmel, emlékeztető nélkül).
// Használat:  node --env-file=backend/.env tools/seed-dummy.mjs                 -> néhány foglalás a következő napokra
//             node --env-file=backend/.env tools/seed-dummy.mjs --history       -> 2026-08-01 … 2026-11-30 kitöltése
//                  (--from=YYYY-MM-DD --to=YYYY-MM-DD felülírja); a múltbeliek nagy része teljesült
//             node --env-file=backend/.env tools/seed-dummy.mjs --soon[=30]     -> egy foglalás ma, N perc múlva (az app 15 perccel előtte értesít)
//             node --env-file=backend/.env tools/seed-dummy.mjs --remove        -> minden dummy foglalás / szabadnap / utalvány törlése
//             node --env-file=backend/.env tools/seed-dummy.mjs --reset --yes   -> MINDEN adat törlése (mentéssel), majd 01-02 … 11-30 vegyes tesztadat
import { randomUUID, randomBytes } from 'node:crypto'
import { createPgStore } from '../backend/src/store-pg.js'
import { findService } from '../backend/src/catalog.js'
import { zonedToUtc, addDays, localDate } from '../backend/src/time.js'

const TZ = 'Europe/Budapest'
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL hiányzik')
const store = createPgStore(process.env.DATABASE_URL)
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const NAMES = ['Kovács Anna', 'Nagy Petra', 'Szabó Lilla', 'Tóth Réka', 'Horváth Dóra', 'Varga Eszter', 'Kiss Bianka', 'Molnár Zsófi',
  'Farkas Nóra', 'Balogh Vivien', 'Papp Kitti', 'Takács Emese', 'Juhász Fanni', 'Lakatos Dorina', 'Mészáros Luca', 'Oláh Boglárka',
  'Simon Hanna', 'Rácz Szilvia', 'Fekete Laura', 'Szilágyi Noémi', 'Török Adrienn', 'Fehér Csilla', 'Balázs Kinga', 'Gál Zita']
const SERVICES = ['gel-egyszinu', 'gel-erositett', 'gel-francia', 'epites-s', 'epites-m', 'epites-l', 'epites-xl', 'toltes-s', 'toltes-m', 'toltes-l', 'toltes-xl']

// Determinisztikus véletlen, hogy ugyanaz a parancs ugyanazt az adatot adja
let seed = 20261120
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const pick = (list) => list[Math.floor(rnd() * list.length)]

const today = localDate(new Date(), TZ)
const weekday = (key) => new Date(`${key}T12:00:00Z`).getUTCDay()

function quickPlan() {
  return [
    [1, '09:00', 'gel-francia', 'Kovács Anna', true], [1, '12:00', 'epites-m', 'Nagy Petra', true], [1, '15:30', 'toltes-s', 'Szabó Lilla', false],
    [2, '10:00', 'gel-egyszinu', 'Tóth Réka', false], [3, '09:30', 'toltes-xl', 'Horváth Dóra', true], [3, '13:00', 'gel-erositett', 'Varga Eszter', false],
    [5, '11:00', 'epites-l', 'Kiss Bianka', false], [6, '14:00', 'toltes-m', 'Molnár Zsófi', true],
  ].map(([offset, time, serviceId, name, paid]) => ({ date: addDays(today, offset), time, serviceId, name, paid, status: 'booked' }))
}

function historyPlan(from, to) {
  const plan = []
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const wd = weekday(date)
    if (wd === 0) continue // vasárnap zárva
    const slots = wd === 6 ? ['09:00', '11:30'] : ['09:00', '12:00', '15:00']
    const count = wd === 6 ? Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 3)
    for (const time of slots.filter(() => rnd() < count / slots.length)) {
      const past = date < today
      const r = rnd()
      // Múlt: ~85% teljesült, ~7% nem jött el, ~8% lemondva; jövő: foglalt
      const status = !past ? 'booked' : r < 0.85 ? 'completed' : r < 0.92 ? 'no_show' : 'cancelled'
      plan.push({ date, time, serviceId: pick(SERVICES), name: pick(NAMES), paid: rnd() < 0.35, status })
    }
  }
  return plan
}

// --reset --yes: MINDEN adat törlése (foglalások, szabadnapok, utalványok, fizetések, emlékeztetők),
// előtte mentés a projekt mellé (../nbe-backup-<idő>.json), majd egy teljes év vegyes tesztadata.
function resetYear(state, from, to) {
  const CLOSED = ['12-24', '12-25', '12-26', '12-31', '01-01']
  const phoneOf = new Map(NAMES.map((name, i) => [name, `+3630${String(2000000 + i * 137531).slice(0, 7)}`]))
  const NOTES = ['Rövidebb formát szeretnék', 'Nude árnyalat', 'Kicsit sietnék', 'Csillámos díszítés jöhet', 'Allergiás vagyok a parfümre']
  const bookings = [], blocks = [], tally = {}
  const add = (status) => (tally[status] = (tally[status] ?? 0) + 1)
  const dayBlock = (date, urgent) => ({
    id: randomUUID(), dummy: true, urgent, reason: urgent ? 'Sürgős szabadnap' : 'Szabadnap',
    startsAt: zonedToUtc(date, '00:00', TZ).toISOString(), endsAt: zonedToUtc(addDays(date, 1), '00:00', TZ).toISOString(),
  })
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const wd = weekday(date)
    if (wd === 0 || CLOSED.includes(date.slice(5))) continue
    const past = date < today
    const r = rnd()
    if (r < 0.04) { blocks.push(dayBlock(date, false)); add('szabadnap'); continue } // sima szabadnap: nincs foglalás
    const urgent = r < 0.06
    const cancelForUrgent = urgent && rnd() < 0.65 // különben „csak letiltás”: a foglalások maradnak
    if (urgent) { blocks.push(dayBlock(date, true)); add('sürgős szabadnap') }
    const slots = wd === 6 ? ['09:00', '11:30'] : ['09:00', '12:00', '15:00']
    const count = urgent ? 1 + Math.floor(rnd() * 2) : wd === 6 ? Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 3)
    for (const time of slots.filter(() => rnd() < count / slots.length)) {
      const service = findService(pick(SERVICES))
      const name = pick(NAMES), phone = phoneOf.get(name)
      const start = zonedToUtc(date, time, TZ), end = new Date(start.getTime() + service.durationMinutes * 60_000)
      const createdAt = new Date(start.getTime() - (1 + Math.floor(rnd() * 13)) * 86_400_000)
      const paid = rnd() < 0.35
      const deposit = Math.round(service.priceHuf * 0.3)
      const x = rnd()
      let status = cancelForUrgent ? 'cancelled'
        : past ? (x < 0.80 ? 'completed' : x < 0.84 ? 'no_show_late' : x < 0.88 ? 'no_show' : x < 0.95 ? 'cancel_guest' : x < 0.98 ? 'cancel_admin' : 'expired')
        : (x < 0.85 ? 'booked' : x < 0.95 ? 'pending_payment' : 'cancel_guest')
      const b = {
        id: randomUUID(), manageToken: randomBytes(18).toString('base64url'), dummy: true,
        name, phone, email: `${name.split(' ')[1].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}.${phone.slice(-3)}@example.com`,
        serviceId: service.id, serviceName: service.name, durationMinutes: service.durationMinutes, priceHuf: service.priceHuf,
        startsAt: start.toISOString(), endsAt: end.toISOString(), status: 'booked',
        paymentStatus: paid ? 'paid' : 'not_required', paymentReason: null,
        amountDueHuf: paid ? deposit : 0, amountPaidHuf: paid ? deposit : 0, feeBookingIds: [],
        confirmationStatus: paid || rnd() < 0.6 ? 'confirmed' : 'awaiting',
        acceptedRulesAt: createdAt.toISOString(), createdAt: createdAt.toISOString(), customerNote: rnd() < 0.15 ? pick(NOTES) : '',
      }
      if (status === 'completed') { b.status = 'completed'; b.completedAt = end.toISOString() }
      else if (status === 'no_show_late' || status === 'no_show') { b.status = 'no_show'; b.noShowReason = status === 'no_show_late' ? 'late' : 'no_show'; b.noShowAt = end.toISOString() }
      else if (status === 'expired') { b.status = 'expired'; b.paymentStatus = 'required'; b.amountDueHuf = deposit; b.amountPaidHuf = 0 }
      else if (status === 'pending_payment') { b.status = 'pending_payment'; b.paymentStatus = 'required'; b.paymentReason = 'deposit'; b.amountDueHuf = deposit; b.amountPaidHuf = 0; b.holdExpiresAt = start.toISOString() }
      else if (status === 'cancelled' || status === 'cancel_guest' || status === 'cancel_admin') {
        const byGuest = status === 'cancel_guest'
        const late = byGuest && rnd() < 0.4
        const cancelledAt = new Date(late ? start.getTime() - 6 * 3_600_000 : Math.max(createdAt.getTime(), start.getTime() - 3 * 86_400_000))
        Object.assign(b, { status: 'cancelled', cancelledAt: cancelledAt.toISOString(), cancelledBy: byGuest ? 'guest' : 'admin', lateCancellation: late })
        if (status === 'cancelled') b.cancelReason = 'urgent_block'
        if (b.amountPaidHuf) b.refundStatus = date < addDays(today, -7) && rnd() < 0.7 ? 'refunded' : 'review'
      }
      bookings.push(b)
      add(b.cancelReason ? 'eldobva (sürgős)' : status)
    }
  }
  // Ajándékutalványok vegyesen
  const vouchers = []
  for (let i = 0; i < 14; i++) {
    const created = addDays(from, Math.floor(rnd() * 300))
    if (created > today) continue
    const createdAt = zonedToUtc(created, '10:00', TZ)
    const code = `NBE-${randomBytes(4).toString('hex').toUpperCase().slice(0, 4)}-${randomBytes(4).toString('hex').toUpperCase().slice(0, 4)}`.replace(/[01]/g, '7')
    const x = rnd(), buyer = pick(NAMES)
    const v = {
      id: randomUUID(), dummy: true, code, amountHuf: 5000 + Math.floor(rnd() * 31) * 500,
      buyerName: buyer, buyerEmail: `vasarlo.${i}@example.com`, recipientName: rnd() < 0.7 ? pick(NAMES) : '', message: rnd() < 0.5 ? 'Boldog szülinapot!' : '',
      createdAt: createdAt.toISOString(), status: x < 0.2 ? 'pending_payment' : x < 0.6 ? 'active' : 'redeemed',
    }
    if (v.status !== 'pending_payment') {
      v.paidAt = createdAt.toISOString()
      const exp = new Date(createdAt); exp.setUTCMonth(exp.getUTCMonth() + 12); v.expiresAt = exp.toISOString()
    }
    if (v.status === 'redeemed') v.redeemedAt = new Date(Math.min(Date.now(), createdAt.getTime() + 40 * 86_400_000)).toISOString()
    vouchers.push(v)
  }
  state.bookings = bookings
  state.blocks = blocks
  state.vouchers = vouchers
  state.payments = []
  state.reminders = []
  return `Minden adat törölve, új tesztadat: ${bookings.length} foglalás, ${blocks.length} szabadnap, ${vouchers.length} utalvány ${JSON.stringify(tally)}`
}

const soonArg = process.argv.find((a) => a === '--soon' || a.startsWith('--soon='))
const mode = process.argv.includes('--reset') ? 'reset' : process.argv.includes('--remove') ? 'remove' : process.argv.includes('--history') ? 'history' : soonArg ? 'soon' : 'quick'
function soonPlan(minutes) {
  // Kezdés: most + N perc, 5 percre felfelé kerekítve, helyi időben
  const at = new Date(Math.ceil((Date.now() + minutes * 60_000) / 300_000) * 300_000)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)
  return [{ date: localDate(at, TZ), time, serviceId: 'gel-francia', name: 'Teszt Vendég', paid: false, status: 'booked' }]
}
if (mode === 'reset') {
  if (!process.argv.includes('--yes')) throw new Error('A --reset minden adatot töröl; megerősítéshez add hozzá: --yes')
  const { writeFileSync } = await import('node:fs')
  const backup = await store.read((state) => state)
  const file = new URL(`../../nbe-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url)
  writeFileSync(file, JSON.stringify(backup, null, 2))
  console.log('Mentés:', file.pathname, `(${backup.bookings.length} foglalás, ${backup.blocks.length} tiltás, ${backup.vouchers.length} utalvány)`)
}
const result = await store.update((state) => {
  if (mode === 'reset') return resetYear(state, arg('from') ?? '2026-01-02', arg('to') ?? '2026-11-30')
  if (mode === 'remove') {
    const ids = new Set(state.bookings.filter((b) => b.dummy).map((b) => b.id))
    state.bookings = state.bookings.filter((b) => !ids.has(b.id))
    state.reminders = state.reminders.filter((r) => !ids.has(r.bookingId))
    state.blocks = state.blocks.filter((b) => !b.dummy)
    state.vouchers = state.vouchers.filter((v) => !v.dummy)
    return `${ids.size} dummy foglalás törölve (a dummy szabadnapok és utalványok is)`
  }
  const plan = mode === 'history' ? historyPlan(arg('from') ?? '2026-08-01', arg('to') ?? '2026-11-30') : mode === 'soon' ? soonPlan(Number(soonArg.split('=')[1] ?? 30)) : quickPlan()
  const active = state.bookings.filter((b) => ['booked', 'pending_payment', 'completed'].includes(b.status))
  const tally = {}
  let skipped = 0
  for (const { date, time, serviceId, name, paid, status } of plan) {
    const service = findService(serviceId)
    const start = zonedToUtc(date, time, TZ)
    const end = new Date(start.getTime() + service.durationMinutes * 60_000)
    const overlaps = (item) => new Date(item.startsAt) < end && new Date(item.endsAt) > start
    if (active.some(overlaps) || state.blocks.some(overlaps)) { skipped++; continue }
    const deposit = paid ? Math.round(service.priceHuf * 0.3) : 0
    const phone = `+3630${String(1000000 + Math.floor(rnd() * 8999999))}`
    const at = new Date(Math.min(Date.now(), start.getTime() - 3 * 86_400_000)).toISOString()
    const booking = {
      id: randomUUID(), manageToken: randomBytes(18).toString('base64url'), dummy: true,
      name, phone, email: `teszt.${phone.slice(-4)}@example.com`,
      serviceId, serviceName: service.name, durationMinutes: service.durationMinutes, priceHuf: service.priceHuf,
      startsAt: start.toISOString(), endsAt: end.toISOString(), status,
      paymentStatus: paid ? 'paid' : 'not_required', paymentReason: null,
      amountDueHuf: deposit, amountPaidHuf: deposit, feeBookingIds: [],
      confirmationStatus: paid ? 'confirmed' : 'awaiting',
      acceptedRulesAt: at, createdAt: at, customerNote: '',
    }
    if (status === 'completed') booking.completedAt = end.toISOString()
    if (status === 'no_show') { booking.noShowReason = 'no_show'; booking.noShowAt = end.toISOString() }
    if (status === 'cancelled') {
      booking.cancelledAt = at
      if (deposit) booking.refundStatus = rnd() < 0.5 ? 'refunded' : 'review'
    }
    state.bookings.push(booking)
    if (status === 'booked' || status === 'completed') active.push(booking)
    tally[status] = (tally[status] ?? 0) + 1
  }
  return `${Object.values(tally).reduce((a, b) => a + b, 0)} dummy foglalás hozzáadva ${JSON.stringify(tally)}, ${skipped} ütközés/szabadnap miatt kihagyva`
})
console.log(result)
await store.close()
