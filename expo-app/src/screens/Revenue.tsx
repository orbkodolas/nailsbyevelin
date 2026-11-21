import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { Ban, CalendarCheck, CalendarOff, CalendarX2, ChevronRight, CircleCheck, Clock, Hourglass, Siren, UserX, ZoomOut } from 'lucide-react-native'
import { Block, Booking, getBookings } from '../api'
import { RevenueChart, type Point } from '../components/RevenueChart'
import { CountUp, countUpPending, markCountUpPlayed } from '../components/CountUp'
import { addDays, c, dayKey, f, fmtDayLong, fmtTime, huf, MONTHS, s, weekdayOf } from '../theme'
import { useLayout } from '../ui'
import { useLoad } from '../useLoad'

type Range = 'day' | 'week' | 'month' | 'year'
const RANGES: { key: Range; label: string }[] = [{ key: 'day', label: 'Nap' }, { key: 'week', label: 'Hét' }, { key: 'month', label: 'Hónap' }, { key: 'year', label: 'Év' }]
const COARSER: Record<Range, Range | null> = { day: 'week', week: 'month', month: 'year', year: null }

/** Egy nézet a görbén: milyen bontásban, melyik időszakot mutatja (YYYY-MM-DD határok, zárt intervallum) */
type Frame =
  | { kind: 'years'; title: string }
  | { kind: 'months'; from: string; to: string; title: string }
  | { kind: 'weeks'; from: string; to: string; title: string }
  | { kind: 'days'; from: string; to: string; title: string }
  | { kind: 'hours'; day: string; title: string }

/**
 * Bevételnek számít: a teljesült foglalás, és a már lezajlott, de „Kész”-nek nem jelölt foglalás
 * (ha nem mondták le és nem jelölted „nem jött el”-nek). A jövőbeli foglalás még nem bevétel.
 */
const earned = (b: Booking, now: number) => b.status === 'completed' || (b.status === 'booked' && Date.parse(b.endsAt) <= now)

const weekStart = (key: string) => addDays(key, -((weekdayOf(key) + 6) % 7))
const monthKey = (key: string) => key.slice(0, 7)
const shortDate = (key: string) => `${Number(key.slice(5, 7))}. ${Number(key.slice(8))}.`
const monthLabel = (mk: string) => `${mk.slice(0, 4)}. ${MONTHS[Number(mk.slice(5, 7)) - 1]}`
const monthEnd = (mk: string) => addDays(`${addMonths(mk, 1)}-01`, -1)
function addMonths(mk: string, delta: number) {
  const d = new Date(Date.UTC(Number(mk.slice(0, 4)), Number(mk.slice(5, 7)) - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const windowOf = (fr: Frame): [string, string] =>
  fr.kind === 'years' ? ['0000-00-00', '9999-99-99'] : fr.kind === 'hours' ? [fr.day, fr.day]
    : fr.kind === 'months' ? [`${fr.from}-01`, monthEnd(fr.to)] : [fr.from, fr.to]

function rootFrame(range: Range, today: string): Frame {
  const month = monthKey(today)
  if (range === 'day') return { kind: 'days', from: addDays(today, -29), to: today, title: 'Utolsó 30 nap' }
  if (range === 'week') return { kind: 'weeks', from: addDays(weekStart(today), -77), to: today, title: 'Utolsó 12 hét' }
  if (range === 'month') return { kind: 'months', from: addMonths(month, -11), to: month, title: 'Utolsó 12 hónap' }
  return { kind: 'years', title: 'Évek' }
}

type DayAgg = { value: number; count: number; byHour: Map<number, { value: number; names: string[] }> }

export function Revenue({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { data, error, refreshing, reload } = useLoad(getBookings, onUnauthorized)
  const { gutter, width } = useLayout()
  const wide = width >= 900
  const today = dayKey(new Date())
  const [range, setRange] = useState<Range>('day')
  const [stack, setStack] = useState<Frame[]>(() => [rootFrame('day', today)])
  const [scrollOn, setScrollOn] = useState(true)
  const frame = stack[stack.length - 1]
  // Hidegindítás utáni első megjelenéskor a számok felszámolnak (CountUp.js-szerű easeOutExpo)
  const [intro] = useState(countUpPending)
  useEffect(() => { if (data) markCountUpPlayed() }, [data])

  // Napi összesítés egyszer; minden nézet ebből számol
  const agg = useMemo(() => {
    const now = Date.now()
    const byDay = new Map<string, DayAgg>()
    for (const b of data?.bookings ?? []) {
      if (!earned(b, now)) continue
      const k = dayKey(b.startsAt)
      const d = byDay.get(k) ?? { value: 0, count: 0, byHour: new Map() }
      d.value += b.priceHuf; d.count++
      const h = Number(fmtTime(b.startsAt).slice(0, 2))
      const slot = d.byHour.get(h) ?? { value: 0, names: [] }
      slot.value += b.priceHuf; slot.names.push(b.name)
      d.byHour.set(h, slot)
      byDay.set(k, d)
    }
    const sum = (from: string, to: string) => {
      let value = 0, count = 0
      for (const [k, v] of byDay) if (k >= from && k <= to) { value += v.value; count += v.count }
      return { value, count }
    }
    const firstDay = [...byDay.keys()].sort()[0]
    return { byDay, sum, firstDay }
  }, [data])

  const points = useMemo<Point[]>(() => buildPoints(frame, agg, today), [frame, agg, today])
  const [from, to] = windowOf(frame)
  const stats = useMemo(() => breakdown(data?.bookings ?? [], data?.blocks ?? [], from, to), [data, from, to])

  // Felső csempék és havi statisztika (független a görbétől)
  const head = useMemo(() => {
    const { sum, firstDay } = agg
    const week = weekStart(today), month = monthKey(today)
    const tiles = { today: sum(today, today), week: sum(week, today), month: sum(`${month}-01`, today), year: sum(`${today.slice(0, 4)}-01-01`, today), total: sum('0000', '9999') }
    const months: { key: string; value: number; count: number }[] = []
    if (firstDay) for (let mk = monthKey(firstDay); mk <= month; mk = addMonths(mk, 1)) months.push({ key: mk, ...sum(`${mk}-01`, monthEnd(mk)) })
    const sorted = months.map((m) => m.value).sort((a, b) => a - b)
    const mid = sorted.length / 2
    const median = !sorted.length ? 0 : sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2
    const minMonth = months.reduce<(typeof months)[number] | undefined>((m, x) => (!m || x.value < m.value ? x : m), undefined)
    const maxMonth = months.reduce<(typeof months)[number] | undefined>((m, x) => (!m || x.value > m.value ? x : m), undefined)
    return { tiles, months: [...months].reverse(), avg: months.length ? Math.round(tiles.total.value / months.length) : 0, median: Math.round(median), minMonth, maxMonth }
  }, [agg, today])

  function chooseRange(r: Range) { setRange(r); setStack([rootFrame(r, today)]) }
  function zoomIn(i: number) {
    const child = childOf(frame, points[i])
    if (child) setStack((st) => [...st, child])
  }
  function zoomOut() {
    if (stack.length > 1) return setStack((st) => st.slice(0, -1))
    const coarser = COARSER[range]
    if (coarser) chooseRange(coarser)
  }
  const canZoomOut = stack.length > 1 || COARSER[range] !== null
  const { tiles } = head

  return (
    <ScrollView style={s.screen} scrollEnabled={scrollOn} contentContainerStyle={{ padding: gutter, paddingBottom: 32, gap: 16, width: '100%', maxWidth: 1240, alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={c.rose} colors={[c.rose]} progressBackgroundColor={c.card} />}>
      {error && <Text style={{ color: c.danger, fontFamily: f.sans }}>{error}</Text>}

      <View style={[s.card, { padding: 20, gap: 4, backgroundColor: c.raised }]}>
        <Text style={s.eyebrow}>Eddigi teljes bevétel</Text>
        <CountUp value={tiles.total.value} format={huf} animate={intro} duration={1400} style={{ color: c.text, fontFamily: f.semibold, fontSize: 48, lineHeight: 56 }} adjustsFontSizeToFit numberOfLines={1} />
        <Text style={s.small}>{tiles.total.count} vendég · teljesült és lezajlott foglalások alapján</Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Tile label="Ma" intro={intro} delay={120} value={tiles.today.value} note={`${tiles.today.count} vendég`} basis={wide ? '23%' : '47%'} />
        <Tile label="Ezen a héten" intro={intro} delay={200} value={tiles.week.value} note={`${tiles.week.count} vendég`} basis={wide ? '23%' : '47%'} />
        <Tile label="Ebben a hónapban" intro={intro} delay={280} value={tiles.month.value} note={`${tiles.month.count} vendég`} basis={wide ? '23%' : '47%'} />
        <Tile label="Idén" intro={intro} delay={360} value={tiles.year.value} note={`${tiles.year.count} vendég`} basis={wide ? '23%' : '47%'} />
      </View>

      <View style={wide ? { flexDirection: 'row', gap: 16, alignItems: 'flex-start' } : { gap: 16 }}>
        <View style={[s.card, { padding: 16, gap: 12 }, wide && { flex: 1 }]}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={s.title}>Bevétel alakulása</Text>
            <View style={{ flexDirection: 'row', backgroundColor: c.bg, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: c.line }}>
              {RANGES.map((r) => {
                const on = r.key === range && stack.length === 1
                return (
                  <Pressable key={r.key} onPress={() => chooseRange(r.key)} accessibilityRole="button" accessibilityState={{ selected: on }}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9, backgroundColor: on ? c.roseSoft : 'transparent' }}>
                    <Text style={{ color: on ? c.rose : c.muted, fontFamily: on ? f.semibold : f.sans, fontSize: 13 }}>{r.label}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          {/* Útvonal: hova nagyítottunk */}
          <View style={[s.row, { gap: 4 }]}>
            {stack.map((fr, i) => (
              <View key={i} style={[s.row, { gap: 4 }]}>
                {i > 0 && <ChevronRight size={13} color={c.faint} strokeWidth={1.8} />}
                <Pressable onPress={() => setStack((st) => st.slice(0, i + 1))} disabled={i === stack.length - 1} hitSlop={6}>
                  <Text style={[s.small, { color: i === stack.length - 1 ? c.text : c.rose, fontFamily: i === stack.length - 1 ? f.medium : f.sans }]}>{fr.title}</Text>
                </Pressable>
              </View>
            ))}
            <View style={{ flex: 1 }} />
            {canZoomOut && (
              <Pressable onPress={zoomOut} hitSlop={8} accessibilityLabel="Kicsinyítés"
                style={({ pressed }) => [s.row, { gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1, borderColor: c.line }, pressed && { opacity: 0.6 }]}>
                <ZoomOut size={13} color={c.muted} strokeWidth={1.8} />
                <Text style={[s.small, { color: c.muted }]}>Kicsinyítés</Text>
              </Pressable>
            )}
          </View>

          <RevenueChart key={`${stack.length}-${frame.title}`} points={points} onZoomIn={zoomIn} onZoomOut={zoomOut} onTouchActive={(on) => setScrollOn(!on)} />
          <Text style={[s.small, { color: c.faint, textAlign: 'center' }]}>Húzd az ujjad a görbén · széthúzás vagy dupla koppintás: nagyítás · összecsípés: kicsinyítés</Text>
        </View>

        <View style={[{ gap: 10 }, wide && { width: 380 }]}>
          <Text style={[s.eyebrow, { marginTop: 4 }]}>Havi bevétel{head.months.length ? ` · ${head.months.length} hónap` : ''}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Tile label="Átlag / hónap" value={head.avg} basis="47%" />
            <Tile label="Középérték / hónap" value={head.median} basis="47%" />
            <Tile label="Minimum" value={head.minMonth?.value ?? 0} note={head.minMonth && monthLabel(head.minMonth.key)} basis="47%" />
            <Tile label="Maximum" value={head.maxMonth?.value ?? 0} note={head.maxMonth && monthLabel(head.maxMonth.key)} basis="47%" />
          </View>
        </View>
      </View>

      {/* Bontott statisztika a görbén látható időszakra */}
      <View style={[s.card, { padding: 16, gap: 12 }]}>
        <View>
          <Text style={s.title}>Foglalások és szabadnapok</Text>
          <Text style={s.small}>{frame.kind === 'years' ? 'Minden idők' : frame.title} · a görbével együtt változik</Text>
        </View>
        <View style={wide ? { flexDirection: 'row', gap: 24 } : { gap: 12 }}>
          <View style={{ flex: 1, gap: 10 }}>
            <StatRow icon={CalendarCheck} label="Foglalt időpont" value={stats.total} strong />
            <StatRow icon={CircleCheck} label="Teljesült" value={stats.completed} of={stats.total} />
            <StatRow icon={Hourglass} label="Még előtte áll" value={stats.upcoming} of={stats.total} />
            <StatRow icon={Clock} label="Késés miatt elmaradt" value={stats.late} of={stats.total} />
            <StatRow icon={UserX} label="Nem jött el" value={stats.noShow} of={stats.total} />
          </View>
          <View style={{ flex: 1, gap: 10 }}>
            <StatRow icon={Ban} label="Lemondta a vendég" value={stats.guestCancel} of={stats.total} note={stats.guestLate ? `ebből ${stats.guestLate} késői (24 órán belül)` : undefined} />
            <StatRow icon={Ban} label="Te mondtad le" value={stats.adminCancel} of={stats.total} />
            <StatRow icon={CalendarX2} label="Eldobva sürgős szabadnap miatt" value={stats.droppedUrgent} of={stats.total} />
            <StatRow icon={CalendarOff} label="Szabadnap" value={stats.daysOff} unit="nap" />
            <StatRow icon={Siren} label="Sürgős szabadnap" value={stats.urgentDaysOff} unit="nap" />
          </View>
        </View>
      </View>

      <View style={[s.card, { padding: 0, gap: 0, overflow: 'hidden' }]}>
        <View style={[s.row, { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line }]}>
          <Text style={[s.small, { flex: 1, fontFamily: f.medium }]}>Hónap</Text>
          <Text style={[s.small, { width: 58, textAlign: 'right', fontFamily: f.medium }]}>Vendég</Text>
          <Text style={[s.small, { minWidth: 100, textAlign: 'right', fontFamily: f.medium }]}>Bevétel</Text>
        </View>
        {head.months.length === 0 && <Text style={[s.muted, { padding: 16 }]}>Még nincs bevétel.</Text>}
        {head.months.map((m, i) => (
          // Egy sorban marad: a hónapnév szükség esetén kicsit összemegy (keskeny telefonon), nem törik két sorba
          <View key={m.key} style={[s.row, { flexWrap: 'nowrap', paddingHorizontal: 16, paddingVertical: 11 }, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}>
            <Text style={[s.text, { flex: 1, flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{monthLabel(m.key)}</Text>
            <Text style={[s.muted, { width: 58, textAlign: 'right', fontVariant: ['tabular-nums'] }]}>{m.count}</Text>
            <Text style={[s.text, { minWidth: 100, textAlign: 'right', fontFamily: f.medium, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>{huf(m.value)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

function buildPoints(frame: Frame, agg: { byDay: Map<string, DayAgg>; sum: (a: string, b: string) => { value: number; count: number }; firstDay?: string }, today: string): Point[] {
  const { byDay, sum, firstDay } = agg
  const out: Point[] = []
  if (frame.kind === 'years') {
    const current = Number(today.slice(0, 4))
    for (let y = Math.min(Number((firstDay ?? today).slice(0, 4)), current - 1); y <= current; y++) {
      out.push({ key: String(y), axis: String(y), label: `${y}`, zoomable: true, ...sum(`${y}-01-01`, `${y}-12-31`) })
    }
  } else if (frame.kind === 'months') {
    for (let mk = frame.from; mk <= frame.to; mk = addMonths(mk, 1)) {
      out.push({ key: mk, axis: MONTHS[Number(mk.slice(5, 7)) - 1].slice(0, 3), label: monthLabel(mk), zoomable: true, ...sum(`${mk}-01`, monthEnd(mk)) })
    }
  } else if (frame.kind === 'weeks') {
    for (let ws = weekStart(frame.from); ws <= frame.to; ws = addDays(ws, 7)) {
      const a = ws < frame.from ? frame.from : ws, b = addDays(ws, 6) > frame.to ? frame.to : addDays(ws, 6)
      out.push({ key: ws, axis: shortDate(a), label: `${shortDate(a)} – ${shortDate(b)}`, zoomable: true, ...sum(a, b) })
    }
  } else if (frame.kind === 'days') {
    for (let k = frame.from; k <= frame.to; k = addDays(k, 1)) {
      const d = byDay.get(k)
      out.push({ key: k, axis: shortDate(k), label: fmtDayLong(k), zoomable: true, value: d?.value ?? 0, count: d?.count ?? 0 })
    }
  } else {
    const d = byDay.get(frame.day)
    for (let h = 8; h <= 18; h++) {
      const slot = d?.byHour.get(h)
      out.push({ key: String(h), axis: `${String(h).padStart(2, '0')}h`, label: `${fmtDayLong(frame.day)}, ${h}:00–${h + 1}:00`, zoomable: false, value: slot?.value ?? 0, count: slot?.names.length ?? 0, names: slot?.names })
    }
  }
  return out
}

/** A kijelölt pont egy szinttel részletesebb nézete (év → hónapok → hetek → napok → órák) */
function childOf(frame: Frame, p?: Point): Frame | null {
  if (!p || !p.zoomable) return null
  if (frame.kind === 'years') return { kind: 'months', from: `${p.key}-01`, to: `${p.key}-12`, title: p.key }
  if (frame.kind === 'months') return { kind: 'weeks', from: `${p.key}-01`, to: monthEnd(p.key), title: monthLabel(p.key) }
  if (frame.kind === 'weeks') {
    const from = p.key < frame.from ? frame.from : p.key
    const end = addDays(p.key, 6)
    return { kind: 'days', from, to: end > frame.to ? frame.to : end, title: p.label }
  }
  if (frame.kind === 'days') return { kind: 'hours', day: p.key, title: fmtDayLong(p.key) }
  return null
}

function breakdown(bookings: Booking[], blocks: Block[], from: string, to: string) {
  const now = Date.now()
  const inWin = bookings.filter((b) => { const k = dayKey(b.startsAt); return k >= from && k <= to && b.status !== 'expired' })
  const cancelled = inWin.filter((b) => b.status === 'cancelled')
  const guest = cancelled.filter((b) => b.cancelledBy !== 'admin')
  const days = (b: Block) => {
    let n = 0
    for (let k = dayKey(b.startsAt); k < dayKey(b.endsAt) || (k === dayKey(b.endsAt) && fmtTime(b.endsAt) !== '00:00'); k = addDays(k, 1)) if (k >= from && k <= to) n++
    return n
  }
  return {
    total: inWin.length,
    completed: inWin.filter((b) => earned(b, now)).length,
    upcoming: inWin.filter((b) => (b.status === 'booked' || b.status === 'pending_payment') && Date.parse(b.endsAt) > now).length,
    late: inWin.filter((b) => b.status === 'no_show' && b.noShowReason === 'late').length,
    noShow: inWin.filter((b) => b.status === 'no_show' && b.noShowReason !== 'late').length,
    guestCancel: guest.length,
    guestLate: guest.filter((b) => b.lateCancellation).length,
    adminCancel: cancelled.filter((b) => b.cancelledBy === 'admin' && b.cancelReason !== 'urgent_block').length,
    droppedUrgent: cancelled.filter((b) => b.cancelReason === 'urgent_block').length,
    daysOff: blocks.filter((b) => !b.urgent).reduce((n, b) => n + days(b), 0),
    urgentDaysOff: blocks.filter((b) => b.urgent).reduce((n, b) => n + days(b), 0),
  }
}

type IconType = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

function StatRow({ icon: Icon, label, value, of, unit, note, strong }: { icon: IconType; label: string; value: number; of?: number; unit?: string; note?: string; strong?: boolean }) {
  const share = of ? value / of : 0
  return (
    <View style={{ gap: 5 }}>
      <View style={[s.row, { flexWrap: 'nowrap' }]}>
        <Icon size={16} color={strong ? c.rose : c.muted} strokeWidth={1.8} />
        <Text style={[s.text, { flex: 1 }, strong && { fontFamily: f.medium }]} numberOfLines={1}>{label}</Text>
        <Text style={{ color: c.text, fontFamily: f.semibold, fontSize: 15, fontVariant: ['tabular-nums'] }}>{value}{unit ? ` ${unit}` : ''}</Text>
        {of !== undefined && <Text style={[s.small, { width: 42, textAlign: 'right', fontVariant: ['tabular-nums'] }]}>{of ? `${Math.round(share * 100)}%` : '–'}</Text>}
      </View>
      {of !== undefined && (
        <View style={{ height: 4, borderRadius: 2, backgroundColor: c.berry, marginLeft: 24 }}>
          <View style={{ width: `${Math.round(share * 100)}%`, height: 4, borderRadius: 2, backgroundColor: c.rose }} />
        </View>
      )}
      {!!note && <Text style={[s.small, { marginLeft: 24, color: c.faint }]}>{note}</Text>}
    </View>
  )
}

function Tile({ label, value, note, basis, intro = false, delay = 0 }: { label: string; value: number; note?: string; basis: `${number}%`; intro?: boolean; delay?: number }) {
  return (
    <View style={[s.card, { flexGrow: 1, flexBasis: basis, paddingVertical: 14, gap: 2 }]}>
      <Text style={s.small} numberOfLines={1}>{label}</Text>
      <CountUp value={value} format={huf} animate={intro} delay={delay} style={{ color: c.text, fontFamily: f.semibold, fontSize: 22, lineHeight: 28 }} adjustsFontSizeToFit numberOfLines={1} />
      {!!note && <Text style={[s.small, { color: c.faint }]} numberOfLines={1}>{note}</Text>}
    </View>
  )
}
