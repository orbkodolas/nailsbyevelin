export const MONTHS = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december']
export const WEEKDAYS = ['H', 'K', 'Sz', 'Cs', 'P', 'Sz', 'V']
const pad = (n: number) => String(n).padStart(2, '0')

export const toDateString = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`
export const todayString = () => { const d = new Date(); return toDateString(d.getFullYear(), d.getMonth(), d.getDate()) }
export function addDays(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return toDateString(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

// A hónap rácsa hétfővel kezdve; null = üres cella
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1))
  const offset = (first.getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return [...Array<null>(offset).fill(null), ...Array.from({ length: days }, (_, i) => toDateString(year, month, i + 1))]
}

export function formatLongDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const weekday = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${y}. ${MONTHS[m - 1]} ${d}., ${weekday}`
}

export function formatDateTime(iso: string) {
  const parts = new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

export function formatWhen(iso: string) {
  const { date, time } = formatDateTime(iso)
  return `${formatLongDate(date)}, ${time}`
}
