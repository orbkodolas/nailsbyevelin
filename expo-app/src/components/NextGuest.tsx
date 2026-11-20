import { Pressable, Text, View } from 'react-native'
import { ChevronRight, Clock, Sparkles } from 'lucide-react-native'
import type { Booking } from '../api'
import { addDays, c, dayKey, f, fmtDayLong, fmtTime, s, untilText } from '../theme'

/** Kiemelt kártya: a következő (vagy épp zajló) vendég visszaszámlálással. */
export function NextGuest({ next, now, today, loaded, onOpen }: { next?: Booking; now: number; today: string; loaded: boolean; onOpen: (day: string) => void }) {
  if (!loaded) return <View style={[s.card, { height: 132 }]} />
  if (!next) {
    return (
      <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20 }]}>
        <Sparkles size={26} color={c.gold} strokeWidth={1.5} />
        <View style={{ flex: 1 }}>
          <Text style={s.h2}>Nincs közelgő vendég</Text>
          <Text style={s.muted}>Pihenj egyet – szólok, ha jön foglalás.</Text>
        </View>
      </View>
    )
  }
  const start = Date.parse(next.startsAt)
  const running = start <= now
  const day = dayKey(next.startsAt)
  const when = day === today ? 'ma' : day === addDays(today, 1) ? 'holnap' : fmtDayLong(day)
  const progress = running ? Math.min(1, (now - start) / (Date.parse(next.endsAt) - start)) : 0

  return (
    <Pressable onPress={() => onOpen(day)} style={({ pressed }) => [s.card, { padding: 20, gap: 10, backgroundColor: c.raised, borderColor: running ? c.rose : c.line }, pressed && { opacity: 0.8 }]}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.eyebrow}>{running ? 'Most zajlik' : 'Következő vendég'}</Text>
        <View style={[s.row, { gap: 6 }]}>
          <Clock size={14} color={c.rose} strokeWidth={2} />
          <Text style={{ color: c.rose, fontFamily: f.semibold, fontSize: 13 }}>{running ? `vége ${fmtTime(next.endsAt)}` : untilText(start - now)}</Text>
        </View>
      </View>
      <View style={[s.row, { flexWrap: 'nowrap', alignItems: 'flex-end' }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.h1} numberOfLines={1}>{next.name}</Text>
          <Text style={s.text}>{next.serviceName}</Text>
          <Text style={s.muted}>{when}, {fmtTime(next.startsAt)}–{fmtTime(next.endsAt)}</Text>
        </View>
        <ChevronRight size={22} color={c.muted} strokeWidth={1.6} />
      </View>
      {running && (
        <View style={{ height: 4, borderRadius: 2, backgroundColor: c.berry, overflow: 'hidden' }}>
          <View style={{ width: `${progress * 100}%`, height: 4, backgroundColor: c.rose }} />
        </View>
      )}
    </Pressable>
  )
}
