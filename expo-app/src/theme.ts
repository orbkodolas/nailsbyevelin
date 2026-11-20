import { StyleSheet } from 'react-native'

// A weboldal palettája (frontend/src/styles/base.css)
export const c = {
  bg: '#0c0809', card: '#171014', raised: '#211519', berry: '#2c1d24',
  rose: '#d7a2aa', roseDeep: '#9c6f78', roseSoft: 'rgba(215,162,170,0.12)', gold: '#b59a80',
  text: '#e6dcdd', muted: '#9e8c91', faint: '#5e4c52', line: 'rgba(215,162,170,0.16)',
  danger: '#e07a7a', dangerSoft: 'rgba(224,122,122,0.12)', ok: '#8fc4a0', okSoft: 'rgba(143,196,160,0.12)',
}

// Betűk: a weboldal Cormorant Garamond (címek) + Jost (szöveg) párosa
export const f = {
  serif: 'CormorantGaramond_500Medium', serifItalic: 'CormorantGaramond_500Medium_Italic',
  sans: 'Jost_400Regular', medium: 'Jost_500Medium', semibold: 'Jost_600SemiBold',
}

export const TZ = 'Europe/Budapest'
const pad = (n: number) => String(n).padStart(2, '0')

// Az Intl-formázók létrehozása Hermesen drága: egyszer hozzuk létre, az eredményt pedig gyorsítótárazzuk
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const dayCache = new Map<string, string>()
const timeCache = new Map<string, string>()
function memo(cache: Map<string, string>, key: string, compute: () => string) {
  let v = cache.get(key)
  if (v === undefined) { if (cache.size > 20_000) cache.clear(); v = compute(); cache.set(key, v) }
  return v
}
const partsOf = (fmt: Intl.DateTimeFormat, date: Date) => {
  const parts = fmt.formatToParts(date)
  return (type: string) => parts.find((p) => p.type === type)?.value ?? ''
}

/** Budapesti naptári nap: YYYY-MM-DD */
export function dayKey(input: string | Date) {
  const key = typeof input === 'string' ? input : input.toISOString()
  return memo(dayCache, key, () => { const get = partsOf(dayFmt, new Date(input)); return `${get('year')}-${get('month')}-${get('day')}` })
}
export const fmtTime = (iso: string) =>
  memo(timeCache, iso, () => { const get = partsOf(timeFmt, new Date(iso)); return `${get('hour')}:${get('minute')}` })

export const MONTHS = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december']
export const WEEKDAYS_SHORT = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V']
const WEEKDAYS = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat']

export const weekdayOf = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay()
/** "november 21., szombat" */
export const fmtDayLong = (key: string) => {
  const [, m, d] = key.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}., ${WEEKDAYS[weekdayOf(key)]}`
}
export const fmtDateShort = (iso: string) => { const k = dayKey(iso); return `${k.slice(0, 4)}. ${k.slice(5, 7)}. ${k.slice(8)}.` }
const numFmt = new Intl.NumberFormat('hu-HU')
export const huf = (n: number) => `${numFmt.format(n).replace(/ | /g, ' ')} Ft`

export function addDays(key: string, days: number) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}
/** A hónap rácsa hétfővel kezdve; null = üres cella */
export function monthGrid(year: number, month: number): (string | null)[] {
  const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: (string | null)[] = [...Array<null>(offset).fill(null)]
  for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(month + 1)}-${pad(d)}`)
  while (cells.length % 7) cells.push(null)
  return cells
}

/** "35 perc múlva", "1 ó 20 p múlva", "most" */
export function untilText(ms: number) {
  if (ms <= 0) return 'most'
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min} perc múlva`
  const h = Math.floor(min / 60), m = min % 60
  if (h >= 24) return `${Math.round(h / 24)} nap múlva`
  return m ? `${h} ó ${m} p múlva` : `${h} óra múlva`
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  h1: { color: c.text, fontSize: 34, fontFamily: f.serif, lineHeight: 40 },
  h2: { color: c.text, fontSize: 24, fontFamily: f.serif },
  eyebrow: { color: c.gold, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', fontFamily: f.medium },
  card: { backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 18, padding: 16, gap: 6 },
  title: { color: c.text, fontSize: 17, fontFamily: f.medium },
  text: { color: c.text, fontSize: 15, fontFamily: f.sans },
  muted: { color: c.muted, fontSize: 14, fontFamily: f.sans },
  small: { color: c.muted, fontSize: 12, fontFamily: f.sans },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  input: { borderColor: c.line, borderWidth: 1, borderRadius: 12, color: c.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: f.sans, backgroundColor: 'rgba(255,255,255,0.03)' },
  btn: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: c.rose, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnText: { color: c.bg, fontSize: 15, fontFamily: f.semibold },
  ghost: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  ghostText: { color: c.text, fontSize: 14, fontFamily: f.medium },
  empty: { color: c.muted, textAlign: 'center', marginTop: 40, fontSize: 15, fontFamily: f.sans },
})
