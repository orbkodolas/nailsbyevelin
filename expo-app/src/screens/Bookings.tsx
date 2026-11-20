import { useMemo, useState } from 'react'
import { Alert, Linking, RefreshControl, SectionList, Text, View } from 'react-native'
import { Booking, bookingAction, errorText, getBookings } from '../api'
import { c, dayKey, fmtDay, fmtTime, huf, s } from '../theme'
import { Badge, Button, confirm } from '../ui'
import { useLoad } from '../useLoad'

const statusLabel: Record<Booking['status'], [string, string]> = {
  booked: ['Foglalt', c.ok], pending_payment: ['Fizetésre vár', c.gold], completed: ['Teljesült', c.muted],
  cancelled: ['Lemondva', c.danger], no_show: ['Nem jött el', c.danger], expired: ['Lejárt', c.muted],
}
const active = (b: Booking) => b.status === 'booked' || b.status === 'pending_payment'

export function Bookings({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { data, error, refreshing, reload } = useLoad(getBookings, onUnauthorized)
  const [past, setPast] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const sections = useMemo(() => {
    const today = dayKey(new Date().toISOString())
    const list = (data?.bookings ?? []).filter((b) => (past ? dayKey(b.startsAt) < today : dayKey(b.startsAt) >= today))
    if (past) list.reverse()
    const groups = new Map<string, Booking[]>()
    for (const b of list) groups.set(dayKey(b.startsAt), [...(groups.get(dayKey(b.startsAt)) ?? []), b])
    return [...groups.values()].map((items) => ({ title: fmtDay(items[0].startsAt), data: items }))
  }, [data, past])

  async function run(b: Booking, action: Parameters<typeof bookingAction>[1], body?: unknown) {
    setBusyId(b.id)
    try { await bookingAction(b.id, action, body); await reload() }
    catch (e) { Alert.alert('Nem sikerült', errorText(e)) }
    finally { setBusyId(null) }
  }

  const noShow = (b: Booking) =>
    Alert.alert('Nem jelent meg', `${b.name} – ${fmtTime(b.startsAt)}`, [
      { text: 'Mégse', style: 'cancel' },
      { text: 'Késett', onPress: () => run(b, 'no-show', { reason: 'late' }) },
      { text: 'Nem jött el', style: 'destructive', onPress: () => run(b, 'no-show', { reason: 'no_show' }) },
    ])

  return (
    <SectionList
      style={s.screen}
      contentContainerStyle={s.list}
      sections={sections}
      keyExtractor={(b) => b.id}
      stickySectionHeadersEnabled={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={c.rose} colors={[c.rose]} />}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <View style={s.row}>
            <Button label="Közelgő" ghost={past} onPress={() => setPast(false)} />
            <Button label="Korábbi" ghost={!past} onPress={() => setPast(true)} />
          </View>
          {error && <Text style={{ color: c.danger }}>{error}</Text>}
        </View>
      }
      ListEmptyComponent={data ? <Text style={s.empty}>{past ? 'Nincs korábbi foglalás.' : 'Nincs közelgő foglalás.'}</Text> : undefined}
      renderSectionHeader={({ section }) => <Text style={s.h2}>{section.title}</Text>}
      renderItem={({ item: b }) => {
        const [label, color] = statusLabel[b.status] ?? [b.status, c.muted]
        const busy = busyId === b.id
        return (
          <View style={[s.card, !active(b) && { opacity: 0.7 }]}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.title}>{fmtTime(b.startsAt)}–{fmtTime(b.endsAt)}  {b.name}</Text>
              <Badge label={label} color={color} />
            </View>
            <Text style={s.text}>{b.serviceName} · {huf(b.priceHuf)}</Text>
            <View style={s.row}>
              {!!b.phone && <Text style={[s.muted, { color: c.rose }]} onPress={() => Linking.openURL(`tel:${b.phone}`)}>{b.phone}</Text>}
              {!!b.email && <Text style={s.muted} onPress={() => Linking.openURL(`mailto:${b.email}`)}>{b.email}</Text>}
            </View>
            {b.amountDueHuf > 0 && <Text style={s.muted}>Fizetendő előre: {huf(b.amountDueHuf)} · befizetve: {huf(b.amountPaidHuf)}</Text>}
            {b.noShowCount > 0 && <Text style={{ color: c.danger, fontSize: 14 }}>Korábban {b.noShowCount}× nem jelent meg</Text>}
            {b.refundStatus === 'review' && <Text style={{ color: c.gold, fontSize: 14 }}>Visszatérítést ellenőrizni kell</Text>}
            {!!b.customerNote && <Text style={[s.muted, { fontStyle: 'italic' }]}>„{b.customerNote}”</Text>}
            <View style={[s.row, { marginTop: 4 }]}>
              {b.status === 'booked' && <Button label="Kész" busy={busy} onPress={() => run(b, 'complete')} />}
              {(b.status === 'pending_payment' || b.status === 'expired') && ['required', 'refund_needed'].includes(b.paymentStatus) &&
                <Button label="Fizetés megjött" busy={busy} onPress={async () => { if (await confirm('Fizetés megerősítése', `${b.name} befizetése megérkezett?`)) run(b, 'payment-confirmed') }} />}
              {active(b) && <Button label="Nem jött el" ghost busy={busy} onPress={() => noShow(b)} />}
              {active(b) && <Button label="Lemondás" ghost danger busy={busy} onPress={async () => { if (await confirm('Foglalás lemondása', `${b.name}, ${fmtDay(b.startsAt)} ${fmtTime(b.startsAt)}`, 'Lemondás', true)) run(b, 'cancel') }} />}
            </View>
          </View>
        )
      }}
    />
  )
}
