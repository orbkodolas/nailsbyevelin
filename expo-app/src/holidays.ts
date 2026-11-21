// Magyarországi munkaszüneti napok (Mt. 102. § (1); december 24. a 2026. november 3-i módosítás óta).
// A húsvéthoz kötött ünnepek évente máshova esnek, ezeket a húsvét dátumából számoljuk.

const FIXED: Record<string, string> = {
  '01-01': 'Újév',
  '03-15': 'Nemzeti ünnep (1848)',
  '05-01': 'A munka ünnepe',
  '08-20': 'Államalapítás ünnepe',
  '10-23': 'Nemzeti ünnep (1956)',
  '11-01': 'Mindenszentek',
  '12-24': 'Szenteste',
  '12-25': 'Karácsony',
  '12-26': 'Karácsony másnapja',
}

// A húsvétvasárnaphoz viszonyított eltolás napokban
const MOVABLE: [number, string][] = [
  [-2, 'Nagypéntek'],
  [0, 'Húsvétvasárnap'],
  [1, 'Húsvéthétfő'],
  [49, 'Pünkösdvasárnap'],
  [50, 'Pünkösdhétfő'],
]

const pad = (n: number) => String(n).padStart(2, '0')

/** Húsvétvasárnap a Gergely-naptár szerint (Meeus/Jones/Butcher-algoritmus) */
function easter(year: number) {
  const a = year % 19, b = Math.floor(year / 100), cc = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(cc / 4), k = cc % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return Date.UTC(year, month - 1, day)
}

const byYear = new Map<number, Map<string, string>>()
function movable(year: number) {
  let map = byYear.get(year)
  if (!map) {
    map = new Map()
    const base = easter(year)
    for (const [offset, name] of MOVABLE) {
      const d = new Date(base + offset * 86_400_000)
      map.set(`${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, name)
    }
    byYear.set(year, map)
  }
  return map
}

/** Az ünnep neve, ha a nap (YYYY-MM-DD) munkaszüneti nap, különben null */
export function holidayName(day: string): string | null {
  const md = day.slice(5)
  return FIXED[md] ?? movable(Number(day.slice(0, 4))).get(md) ?? null
}
