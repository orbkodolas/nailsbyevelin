// Szkriptelt kérdés–válasz bot: kulcsszavas felismerés, a válaszok a katalógusból (árlista, házirend, utalvány) épülnek
import { catalog, durationLabel, forint, minPrice } from './catalog'
import { site } from './site'

export type ChatAction = { label: string; kind: 'booking' } | { label: string; kind: 'section'; target: string } | { label: string; kind: 'link'; href: string }
export type Reply = { text: string; list?: string[]; after?: string; actions?: ChatAction[]; chips?: IntentId[] }
export type BotSettings = { depositPercent: number; maxDaysAhead: number; paymentMethods: { label: string }[] }

export type IntentId =
  | 'greeting' | 'thanks' | 'prices' | 'gel' | 'build' | 'fill' | 'size' | 'extras' | 'other' | 'booking' | 'duration'
  | 'cancel' | 'late' | 'companion' | 'payment' | 'voucher' | 'contact' | 'hours' | 'rules' | 'fallback'

// Gyorsgombok felirata
export const chipLabels: Record<IntentId, string> = {
  greeting: 'Szia!', thanks: 'Köszönöm', prices: 'Árak', gel: 'Géllakk', build: 'Műköröm építés', fill: 'Töltés', size: 'Melyik méret?',
  extras: 'Díszítések', other: 'Eltávolítás, javítás', booking: 'Időpontfoglalás', duration: 'Mennyi ideig tart?', cancel: 'Lemondás',
  late: 'Késés', companion: 'Hozhatok kísérőt?', payment: 'Fizetés', voucher: 'Ajándékutalvány', contact: 'Elérhetőség',
  hours: 'Mikor lehet jönni?', rules: 'Házirend', fallback: 'Egyéb',
}

export const startChips: IntentId[] = ['prices', 'booking', 'duration', 'voucher', 'payment', 'cancel']

// Kulcsszavak ékezet nélkül, szókezdetre illesztve; a prioritás döntetlennél a pontosabb témát választja
const intents: { id: IntentId; priority: number; keys: string[] }[] = [
  { id: 'greeting', priority: 0, keys: ['szia', 'sziasztok', 'hello', 'hali', 'hey', 'udv', 'jo napot', 'jo estet', 'jo reggelt', 'csao', 'szervusz', 'helo'] },
  { id: 'thanks', priority: 1, keys: ['koszon', 'kosz', 'koszi', 'thx', 'thanks', 'szuper', 'rendben', 'oke', 'ok'] },
  { id: 'prices', priority: 1, keys: ['ara', 'arak', 'arlist', 'araz', 'mennyibe', 'mennyi az', 'kerul', 'koltseg', 'forint', 'ft', 'draga', 'olcso'] },
  { id: 'gel', priority: 3, keys: ['gellakk', 'gel lakk', 'gel', 'lakk', 'francia', 'shellac'] },
  { id: 'build', priority: 3, keys: ['epites', 'epit', 'mukorom', 'mu korom', 'akril', 'zsele', 'uj koro', 'hosszabbit'] },
  { id: 'fill', priority: 4, keys: ['toltes', 'tolt', 'lenott', 'lenov', 'frissit'] },
  { id: 'size', priority: 4, keys: ['meret', 'hossz', 'milyen hossz', 'melyik meret'] },
  { id: 'extras', priority: 3, keys: ['diszit', 'extra', 'minta', 'matrica', 'ko ', 'kovez', 'kovek', 'strassz', 'krom', 'glitter', 'csillog', 'babyboomer', 'baby boomer', 'virag', 'porcelan', 'nail art'] },
  { id: 'other', priority: 3, keys: ['eltavolit', 'leszed', 'levesz', 'javit', 'letor', 'torott', 'eltor', 'potl', 'manikur', 'mas csinal', 'mas altal'] },
  { id: 'booking', priority: 2, keys: ['foglal', 'idopont', 'bejelentkez', 'jelentkez', 'szabad', 'mikor van', 'raer', 'helyed', 'hely van', 'beutemez'] },
  { id: 'duration', priority: 5, keys: ['meddig tart', 'mennyi ide', 'hany ora', 'idotartam', 'ido tart', 'sokaig', 'mennyi ido', 'hosszu ideig'] },
  { id: 'cancel', priority: 5, keys: ['lemond', 'le mond', 'mondani', 'mondanam', 'mondom le', 'torol', 'modosit', 'athelyez', 'atrak', 'nem tudok menni', 'nem tudok jonni', 'kozbejo', 'elhalaszt', 'masik napra'] },
  { id: 'late', priority: 5, keys: ['keses', 'elkes', 'kesni', 'kesek', 'kesik', 'kesve', 'kesom', 'pontossag'] },
  { id: 'companion', priority: 5, keys: ['kiser', 'baratnom', 'baratnovel', 'gyerek', 'anyuk', 'parom', 'hozhat', 'velem jon', 'egyutt jo'] },
  { id: 'payment', priority: 4, keys: ['fizet', 'kartya', 'bankkartya', 'keszpenz', 'atutal', 'eloleg', 'foglalo', 'szamla', 'utal'] },
  { id: 'voucher', priority: 6, keys: ['utalvany', 'ajandek', 'kupon', 'voucher', 'ajandekkartya', 'meglep'] },
  { id: 'contact', priority: 4, keys: ['hol ', 'hol van', 'merre', 'kaposvar', 'varos', 'melyik var', 'cim ', 'cime', 'helyszin', 'telefon', 'elerhet', 'kapcsolat', 'facebook', 'instagram', 'uzenet', 'irj', 'hivhat', 'hivni', 'telefonszam', 'beszel'] },
  { id: 'hours', priority: 3, keys: ['nyitva', 'nyitvatart', 'hetveg', 'szombat', 'vasarnap', 'hetfo', 'unnep', 'karacsony', 'szilveszter', 'delutan', 'munkaido', 'mikor lehet', 'mikor jo', 'hanytol'] },
  { id: 'rules', priority: 3, keys: ['hazirend', 'szabaly', 'feltetel'] },
]

export const normalize = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

export function detectIntent(input: string): IntentId {
  const text = ` ${normalize(input)} `
  if (text.trim() === '') return 'fallback'
  let best: IntentId = 'fallback'
  let bestScore = 0
  for (const intent of intents) {
    const found = intent.keys.filter((key) => text.includes(` ${key}`))
    // Az egymás elejét adó kulcsok (gel / gellakk) egy találatnak számítanak
    const hits = found.filter((key) => !found.some((other) => other !== key && other.startsWith(key))).length
    // Az általános árkérdés (mennyibe kerül) csak egyszer számít, így a konkrét szolgáltatás nyer
    const score = hits ? Math.min(hits, intent.id === 'prices' ? 1 : 2) * 10 + intent.priority : 0
    if (score > bestScore) { best = intent.id; bestScore = score }
  }
  return best
}

const cleanLabel = (label: string) => label.replace(/\s*\(.*?\)\s*/g, '').trim()
const rule = (id: string) => catalog.rules.find((item) => item.id === id)?.text ?? ''
const category = (id: string) => catalog.categories.find((item) => item.id === id)!
const priceRange = (id: string) => {
  const items = category(id).items.map((item) => item.priceHuf)
  const low = Math.min(...items)
  const high = Math.max(...items)
  return low === high ? forint(low) : `${forint(low).replace(' Ft', '')} – ${forint(high)}`
}

const book: ChatAction = { label: 'Időpontot foglalok', kind: 'booking' }
const priceList: ChatAction = { label: 'Árlista', kind: 'section', target: '#arlista' }
const facebook: ChatAction | null = site.facebookUrl ? { label: 'Írok Evelinnek', kind: 'link', href: site.facebookUrl } : null
const withFacebook = (actions: ChatAction[]) => (facebook ? [...actions, facebook] : actions)

function categoryReply(id: string, chips: IntentId[]): Reply {
  const cat = category(id)
  return {
    text: `${cat.name}: ${cat.blurb.charAt(0).toLowerCase()}${cat.blurb.slice(1)} Egy alkalom ${durationLabel(cat.durationMinutes)}.`,
    list: cat.items.map((item) => `${item.name} · ${forint(item.priceHuf)}`),
    after: `Az árak ${catalog.pricesValidFromText} érvényesek, a díszítések az alapár mellé jönnek.`,
    actions: [book, priceList],
    chips,
  }
}

export function answer(id: IntentId, settings: BotSettings | null): Reply {
  const days = settings?.maxDaysAhead || 14
  switch (id) {
    case 'greeting':
      return { text: 'Szia! Miben segíthetek? Kérdezz bátran, vagy válassz egy témát lent.', chips: startChips }
    case 'thanks':
      return { text: 'Szívesen! Ha bármi más kérdésed van, itt vagyok.', actions: [book], chips: ['prices', 'voucher', 'rules'] }
    case 'prices':
      return {
        text: `Az árak ${catalog.pricesValidFromText} érvényesek:`,
        list: catalog.categories.map((cat) => `${cat.name} · ${priceRange(cat.id)} (${durationLabel(cat.durationMinutes)})`),
        after: `A díszítések és extrák az alapár mellé jönnek, a legolcsóbb szett ${forint(Math.min(...catalog.categories.map(minPrice)))}.`,
        actions: [priceList, book],
        chips: ['gel', 'build', 'fill', 'extras'],
      }
    case 'gel': return categoryReply('gel', ['extras', 'duration', 'booking'])
    case 'build': return categoryReply('epites', ['size', 'fill', 'extras'])
    case 'fill': return categoryReply('toltes', ['size', 'other', 'booking'])
    case 'size':
      return {
        text: 'A műköröm S-től XL-ig méretezett, a köröm hossza szerint: minél hosszabb, annál több anyag és munka kell hozzá.',
        list: ['S · rövid, természetes hatás', 'M · közepes', 'L · hosszú', 'XL · extra hosszú'],
        after: 'Ha nem vagy biztos benne, foglald azt, ami a legközelebb áll, és a megjegyzésben írd le, mit szeretnél. Evelin segít a választásban.',
        actions: [book],
        chips: ['build', 'fill', 'prices'],
      }
    case 'extras':
      return { text: 'Díszítések és extrák, az alapár mellé:', list: catalog.extras.map((row) => `${row.name} · ${row.price}`), actions: [priceList, book], chips: ['prices', 'other'] }
    case 'other':
      return { text: 'Egyéb szolgáltatások:', list: catalog.otherServices.map((row) => `${row.name} · ${row.price}`), actions: [priceList, book], chips: ['prices', 'extras'] }
    case 'booking':
      return {
        text: `Online tudsz időpontot foglalni: válaszd ki a szolgáltatást, és élőben látod a szabad időpontokat, legfeljebb ${days} napra előre. Pár perc az egész.`,
        after: 'A foglalás előtt kérlek, olvasd el a házirendet is.',
        actions: [book, { label: 'Házirend', kind: 'section', target: '#hazirend' }],
        chips: ['payment', 'duration', 'cancel'],
      }
    case 'duration':
      return {
        text: rule('time'),
        list: catalog.categories.map((cat) => `${cat.name} · ${durationLabel(cat.durationMinutes)}`),
        actions: [book],
        chips: ['late', 'prices', 'booking'],
      }
    case 'cancel':
      return { text: rule('cancel'), actions: withFacebook([]), chips: ['late', 'rules', 'booking'] }
    case 'late':
      return { text: rule('punctual'), chips: ['cancel', 'rules'] }
    case 'companion':
      return { text: rule('alone'), chips: ['rules', 'booking'] }
    case 'payment': {
      const methods = settings?.paymentMethods.map((method) => cleanLabel(method.label)).filter(Boolean) ?? []
      const deposit = settings && settings.depositPercent > 0 ? ` Foglaláskor a szolgáltatás árának ${settings.depositPercent}%-át kell előre kifizetni.` : ''
      return {
        text: `A fizetési módot a foglalás végén választod ki.${deposit}`,
        list: methods.length ? methods : undefined,
        after: 'Szó nélküli meg nem jelenés után új időpont csak teljes előrefizetéssel foglalható.',
        actions: [book],
        chips: ['prices', 'voucher', 'cancel'],
      }
    }
    case 'voucher': {
      const v = catalog.voucher
      return {
        text: `Ajándékutalványt online tudsz venni, ${v.redeemableFor} váltható be, és ${v.validMonths} hónapig érvényes.`,
        list: [`Ajánlott összegek: ${v.presets.map((amount) => forint(amount)).join(', ')}`, `Egyedi összeg: ${forint(v.minHuf)} – ${forint(v.maxHuf)}`],
        after: 'A fizetés után azonnal megkapod az utalvány kódját.',
        actions: [{ label: 'Utalványt veszek', kind: 'section', target: '#utalvany' }],
        chips: ['payment', 'prices'],
      }
    }
    case 'contact': {
      const lines = [site.phone && `Telefon: ${site.phone}`, site.address && `Cím: ${site.address}`].filter(Boolean) as string[]
      return {
        text: lines.length ? `Evelin ${site.cityIn} dolgozik, itt éred el:` : `Evelin ${site.cityIn} (${site.region}) dolgozik. A pontos címet Facebookon kérdezheted meg tőle, ott minden másban is segít.`,
        list: lines.length ? lines : undefined,
        actions: withFacebook([...(site.phone ? [{ label: 'Hívás', kind: 'link' as const, href: `tel:${site.phone.replace(/\s/g, '')}` }] : []), book]),
        chips: ['booking', 'prices'],
      }
    }
    case 'hours':
      return {
        text: `Hogy melyik nap és órában van szabad hely, azt a foglalóban látod, legfeljebb ${days} napra előre. A munkaszüneti ünnepnapokon alapból zárva van.`,
        actions: [book],
        chips: ['duration', 'booking'],
      }
    case 'rules':
      return {
        text: 'A házirend röviden:',
        list: catalog.rules.map((item) => item.title),
        after: 'A részleteket a Házirend résznél találod, vagy kérdezz rá itt bármelyikre.',
        actions: [{ label: 'Házirend', kind: 'section', target: '#hazirend' }],
        chips: ['late', 'cancel', 'companion', 'duration'],
      }
    default:
      return {
        text: 'Erre most nem tudok pontos választ adni. Válassz egy témát lent, vagy írj Evelinnek, és ő személyesen válaszol.',
        actions: withFacebook([]),
        chips: startChips,
      }
  }
}

export const welcome: Reply = {
  text: 'Szia! A Nails by Evelin asszisztense vagyok. Kérdezz bátran az árakról, a foglalásról vagy az utalványról, vagy válassz egy témát.',
  chips: startChips,
}
