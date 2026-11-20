import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { Bell, BellOff, ChevronLeft, ChevronRight } from 'lucide-react-native'
import { Block, Booking, DEFAULT_CLOSED_DAYS, getBookings, getClosedDays } from '../api'
import { NextGuest } from '../components/NextGuest'
import { DaySheet } from '../components/DaySheet'
import { isActive } from '../components/BookingCard'
import { getNotifyPref, LEAD_MINUTES, setNotifyPref, syncArrivalNotifications } from '../notify'
import { addDays, c, dayKey, f, fmtTime, MONTHS, monthGrid, s, WEEKDAYS_SHORT } from '../theme'
import { useLoad } from '../useLoad'
import { useLayout } from '../ui'

// A foglalások élőben változhatnak (weboldalas foglalás): 2 percenként csendes frissítés
const REFRESH_MS = 2 * 60_000

export function Dashboard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { data, error, refreshing, reload, mutate, refreshIfOlder } = useLoad(getBookings, onUnauthorized, REFRESH_MS)
  const { gutter, desktop, width } = useLayout()
  const twoCol = width >= 900
  const [closedDays, setClosedDays] = useState(DEFAULT_CLOSED_DAYS)
  const [now, setNow] = useState(() => Date.now())
  const today = dayKey(new Date(now))
  const [cursor, setCursor] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }))
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [notifyOn, setNotifyOn] = useState(false)

  useEffect(() => { getClosedDays().then(setClosedDays); getNotifyPref().then(setNotifyOn) }, [])

  // Óra a visszaszámláláshoz + automatikus frissítés, és frissítés, amikor az app előtérbe kerül
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000)
    const poll = setInterval(() => { if (AppState.currentState === 'active') refreshIfOlder(REFRESH_MS - 5_000) }, REFRESH_MS)
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') { setNow(Date.now()); refreshIfOlder(30_000) } })
    return () => { clearInterval(tick); clearInterval(poll); sub.remove() }
  }, [refreshIfOlder])

  // Művelet után a szerver válasza a hiteles adat: helyben beírjuk, nem kérjük le újra a teljes listát.
  // Kivétel a „Nem jött el”: az a vendég többi foglalásán is módosítja a számlálót.
  const onBookingUpdated = useCallback((b: Booking) => {
    mutate((d) => ({ ...d, bookings: d.bookings.map((x) => (x.id === b.id ? { ...x, ...b } : x)) }))
    if (b.status === 'no_show') reload(true)
  }, [mutate, reload])
  const onBlockAdded = useCallback((block: Block) => { mutate((d) => ({ ...d, blocks: [...d.blocks, block] })) }, [mutate])
  const onBlockRemoved = useCallback((id: string) => { mutate((d) => ({ ...d, blocks: d.blocks.filter((x) => x.id !== id) })) }, [mutate])

  const bookings = data?.bookings ?? []
  const blocks = data?.blocks ?? []

  const byDay = useMemo(() => {
    const map = new Map<string, Booking[]>()
    for (const b of bookings) { const k = dayKey(b.startsAt); const list = map.get(k); if (list) list.push(b); else map.set(k, [b]) }
    for (const list of map.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    return map
  }, [bookings])

  const blocksOn = useCallback((day: string) => blocks.filter((b) => {
    const start = dayKey(b.startsAt), end = dayKey(b.endsAt)
    return start <= day && (day < end || (day === end && fmtTime(b.endsAt) !== '00:00'))
  }), [blocks])
  const fullDayBlocked = useCallback((day: string) => blocks.some((b) => {
    const start = dayKey(b.startsAt)
    return (start < day || (start === day && fmtTime(b.startsAt) === '00:00')) && dayKey(b.endsAt) > day
  }), [blocks])

  // Értesítések: csak akkor ütemezünk újra, ha a jövőbeli aktív foglalások listája változott
  const signature = useMemo(() => bookings.filter((b) => isActive(b) && Date.parse(b.startsAt) > Date.now()).map((b) => `${b.id}@${b.startsAt}`).join('|'), [bookings])
  const lastSync = useRef<string | null>(null)
  useEffect(() => {
    if (!data || !notifyOn || lastSync.current === signature) return
    lastSync.current = signature
    syncArrivalNotifications(bookings).catch(() => { lastSync.current = null })
  }, [data, signature, notifyOn, bookings])

  async function toggleNotify() {
    const next = !notifyOn
    await setNotifyPref(next)
    lastSync.current = null
    setNotifyOn(next)
  }

  const upcoming = bookings.filter((b) => isActive(b) && Date.parse(b.endsAt) > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const next = upcoming[0]
  const todayCount = (byDay.get(today) ?? []).filter(isActive).length
  const weekEnd = addDays(today, 7)
  const weekCount = upcoming.filter((b) => dayKey(b.startsAt) < weekEnd).length
  const pending = bookings.filter((b) => b.status === 'pending_payment').length

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])
  const shift = (delta: number) => setCursor(({ year, month }) => { const d = new Date(Date.UTC(year, month + delta, 1)); return { year: d.getUTCFullYear(), month: d.getUTCMonth() } })
  const isThisMonth = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}` === today.slice(0, 7)

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: gutter, paddingBottom: 32, width: '100%', maxWidth: 1240, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={c.rose} colors={[c.rose]} progressBackgroundColor={c.card} />}>
        {error && <Text style={{ color: c.danger, fontFamily: f.sans, marginBottom: 12 }}>{error}</Text>}
        <View style={twoCol ? { flexDirection: 'row', gap: 24, alignItems: 'flex-start' } : { gap: 16 }}>
        <View style={twoCol ? { width: desktop ? 380 : 340, gap: 16 } : { gap: 16 }}>
        <NextGuest next={next} now={now} today={today} loaded={Boolean(data)} onOpen={(day) => setOpenDay(day)} />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Stat value={todayCount} label="Ma" />
          <Stat value={weekCount} label="7 napban" />
          <Stat value={pending} label="Fizetésre vár" color={pending ? c.gold : undefined} />
        </View>
        {twoCol && <NotifyToggle on={notifyOn} onPress={toggleNotify} />}
        </View>

        <View style={[s.card, { padding: twoCol ? 20 : 14, gap: 10 }, twoCol && { flex: 1 }]}>
          <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
            <NavButton dir="prev" onPress={() => shift(-1)} />
            <Pressable onPress={() => setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 })} style={{ alignItems: 'center' }}>
              <Text style={[s.h2, { fontSize: 22 }]}>{cursor.year}. {MONTHS[cursor.month]}</Text>
              {!isThisMonth && <Text style={[s.small, { color: c.rose }]}>Vissza a mai naphoz</Text>}
            </Pressable>
            <NavButton dir="next" onPress={() => shift(1)} />
          </View>

          <View style={{ flexDirection: 'row' }}>
            {WEEKDAYS_SHORT.map((w) => <Text key={w} style={{ flex: 1, textAlign: 'center', color: c.muted, fontSize: 11, fontFamily: f.medium, letterSpacing: 0.5 }}>{w}</Text>)}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {grid.map((day, i) => day === null ? <View key={`e${i}`} style={{ width: `${100 / 7}%`, aspectRatio: twoCol ? 1.2 : 0.9 }} /> : (
              <DayCell key={day} day={day} today={today} ratio={twoCol ? 1.2 : 0.9} count={(byDay.get(day) ?? []).filter(isActive).length}
                blocked={fullDayBlocked(day)} partial={!fullDayBlocked(day) && blocksOn(day).length > 0}
                closed={closedDays.includes(day.slice(5))} onPress={() => setOpenDay(day)} />
            ))}
          </View>

          <View style={[s.row, { justifyContent: 'center', gap: 14, paddingTop: 4 }]}>
            <Legend color={c.rose} label="Foglalás" />
            <Legend color={c.danger} label="Szabadnap" />
            <Legend color={c.gold} label="Ünnep" />
          </View>
        </View>

        {!twoCol && <NotifyToggle on={notifyOn} onPress={toggleNotify} />}
        </View>
      </ScrollView>

      <DaySheet day={openDay} today={today} now={now}
        bookings={openDay ? byDay.get(openDay) ?? [] : []} blocks={openDay ? blocksOn(openDay) : []}
        fullDayBlocked={openDay ? fullDayBlocked(openDay) : false} closed={openDay ? closedDays.includes(openDay.slice(5)) : false}
        onClose={() => setOpenDay(null)} onBookingUpdated={onBookingUpdated} onBlockAdded={onBlockAdded} onBlockRemoved={onBlockRemoved} />
    </View>
  )
}

function NotifyToggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }, pressed && { opacity: 0.7 }]}>
      {on ? <Bell size={20} color={c.rose} strokeWidth={1.8} /> : <BellOff size={20} color={c.muted} strokeWidth={1.8} />}
      <View style={{ flex: 1 }}>
        <Text style={s.title}>Értesítés érkezés előtt</Text>
        <Text style={s.small}>{on ? `${LEAD_MINUTES} perccel minden időpont előtt szól a telefon.` : 'Kikapcsolva – koppints a bekapcsoláshoz.'}</Text>
      </View>
      <View style={{ width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: on ? c.rose : c.berry, alignItems: on ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: on ? c.bg : c.muted }} />
      </View>
    </Pressable>
  )
}

function DayCell({ day, today, count, blocked, partial, closed, ratio, onPress }: { day: string; today: string; count: number; blocked: boolean; partial: boolean; closed: boolean; ratio: number; onPress: () => void }) {
  const isToday = day === today
  const past = day < today
  const color = blocked ? c.danger : closed ? c.gold : past ? c.faint : c.text
  return (
    <Pressable onPress={onPress} accessibilityLabel={day} style={{ width: `${100 / 7}%`, aspectRatio: ratio, padding: 2 }}>
      {({ pressed }) => (
        <View style={{
          flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 3,
          backgroundColor: pressed ? c.berry : blocked ? c.dangerSoft : count && !past ? c.roseSoft : 'transparent',
          borderWidth: isToday ? 1.5 : 0, borderColor: c.rose,
        }}>
          <Text style={{ color, fontSize: 15, fontFamily: isToday ? f.semibold : f.sans, textDecorationLine: blocked ? 'line-through' : 'none' }}>{Number(day.slice(8))}</Text>
          <View style={{ flexDirection: 'row', gap: 3, height: 5, alignItems: 'center' }}>
            {count > 0 && count <= 3 && Array.from({ length: count }, (_, i) => <View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: past ? c.roseDeep : c.rose }} />)}
            {count > 3 && <Text style={{ color: c.rose, fontSize: 10, lineHeight: 11, fontFamily: f.semibold }}>{count}</Text>}
            {count === 0 && partial && <View style={{ width: 10, height: 2, borderRadius: 1, backgroundColor: c.danger }} />}
            {count === 0 && !partial && closed && !blocked && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.gold }} />}
          </View>
        </View>
      )}
    </Pressable>
  )
}

function NavButton({ dir, onPress }: { dir: 'prev' | 'next'; onPress: () => void }) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityLabel={dir === 'prev' ? 'Előző hónap' : 'Következő hónap'}
      style={({ pressed }) => [{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }, pressed && { backgroundColor: c.berry }]}>
      <Icon size={20} color={c.text} strokeWidth={1.6} />
    </Pressable>
  )
}

function Stat({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <View style={[s.card, { flex: 1, paddingVertical: 14, paddingHorizontal: 12, gap: 2 }]}>
      <Text style={{ color: color ?? c.text, fontSize: 30, fontFamily: f.serif, lineHeight: 34 }}>{value}</Text>
      <Text style={s.small} numberOfLines={1}>{label}</Text>
    </View>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={[s.row, { gap: 6 }]}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text style={s.small}>{label}</Text>
    </View>
  )
}

