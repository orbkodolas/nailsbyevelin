// Időzóna-kezelés külső csomag nélkül (Intl alapú). A munkaidő helyi időben van megadva.
const formatters = new Map()
function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }))
  }
  return formatters.get(timeZone)
}

function parts(date, timeZone) {
  const out = {}
  for (const { type, value } of formatter(timeZone).formatToParts(date)) out[type] = Number(value)
  return out
}

// A helyi idő és az UTC közti eltérés ezredmásodpercben az adott pillanatban
function offsetMs(date, timeZone) {
  const p = parts(date, timeZone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000
}

const pad = (n) => String(n).padStart(2, '0')

export function zonedToUtc(dateStr, timeStr, timeZone) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, mi)
  const first = offsetMs(new Date(guess), timeZone)
  let result = guess - first
  const second = offsetMs(new Date(result), timeZone)
  if (second !== first) result = guess - second
  return new Date(result)
}

export function localDate(date, timeZone) {
  const p = parts(date, timeZone)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

export function localTime(date, timeZone) {
  const p = parts(date, timeZone)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export const weekdayOf = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay()
export const isDateString = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))

const toMinutes = (time) => { const [h, m] = time.split(':').map(Number); return h * 60 + m }

export const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd

// Egy nap szabad kezdési időpontjai az adott szolgáltatás hosszához.
// busy: [{ startsAt, endsAt }] ISO-időpontok (foglalások és blokkok).
export function slotsForDate({ date, durationMinutes, busy, config, now }) {
  const windows = config.workingHours[weekdayOf(date)] || []
  if (config.closedDays?.includes(date.slice(5))) return [] // évente ismétlődő szünnapok (HH-NN)
  // Legfeljebb maxDaysAhead nappal előre, naptári napokban (a mai nap is számít)
  if (date > addDays(localDate(now, config.timezone), config.maxDaysAhead)) return []
  const earliest = now.getTime() + config.minLeadMinutes * 60_000
  const buffer = config.bufferMinutes * 60_000
  const busyRanges = busy.map((item) => [Date.parse(item.startsAt), Date.parse(item.endsAt)])
  const slots = []
  for (const [open, close] of windows) {
    for (let minute = toMinutes(open); minute + durationMinutes <= toMinutes(close); minute += config.slotStepMinutes) {
      const time = `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
      const start = zonedToUtc(date, time, config.timezone)
      const startMs = start.getTime()
      const endMs = startMs + durationMinutes * 60_000
      if (startMs < earliest) continue
      if (busyRanges.some(([bStart, bEnd]) => overlaps(startMs, endMs + buffer, bStart, bEnd + buffer))) continue
      slots.push({ time, startsAt: start.toISOString() })
    }
  }
  return slots
}
