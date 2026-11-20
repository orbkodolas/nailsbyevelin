import { useState, type ReactNode } from 'react'
import { Linking, Text, View } from 'react-native'
import { Ban, Banknote, Check, Mail, Phone, StickyNote, Undo2, UserX } from 'lucide-react-native'
import { ApiError, Booking, bookingAction, errorText, getBookings } from '../api'
import { invalidate } from '../useLoad'
import { c, f, fmtDayLong, dayKey, fmtTime, huf, s } from '../theme'
import { Badge, Button, IconButton, confirm, notice, showDialog } from '../ui'

export const isActive = (b: Booking) => b.status === 'booked' || b.status === 'pending_payment'

const statusLabel: Record<Booking['status'], [string, string, string]> = {
  booked: ['Foglalt', c.ok, c.okSoft], pending_payment: ['Fizetésre vár', c.gold, 'rgba(181,154,128,0.14)'],
  completed: ['Teljesült', c.muted, 'rgba(158,140,145,0.12)'], cancelled: ['Lemondva', c.danger, c.dangerSoft],
  no_show: ['Nem jött el', c.danger, c.dangerSoft], expired: ['Lejárt', c.muted, 'rgba(158,140,145,0.12)'],
}

/** Egy foglalás az idősávban: bal oldalt az idő, jobbra a kártya a teendőkkel. */
export function BookingCard({ booking: b, onUpdated, now }: { booking: Booking; onUpdated: (b: Booking) => void; now: number }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [label, color, soft] = statusLabel[b.status] ?? [b.status, c.muted, 'transparent']
  const active = isActive(b)
  const running = active && Date.parse(b.startsAt) <= now && now < Date.parse(b.endsAt)
  const started = Date.parse(b.startsAt) <= now
  // „Kész” csak az időpont napjától: jövőbeli foglalást nem lehet előre teljesítettnek jelölni
  const onItsDay = dayKey(b.startsAt) <= dayKey(new Date(now))
  const paid = b.amountPaidHuf || 0
  const gone = b.status === 'cancelled' || b.status === 'no_show' || b.status === 'expired'

  async function run(action: Parameters<typeof bookingAction>[1], body?: unknown) {
    setBusy(action)
    try { onUpdated(await bookingAction(b.id, action, body)) }
    catch (e) {
      // Elavult helyi adat (pl. a vendég közben lemondta): frissítjük a listát
      if (e instanceof ApiError && e.status !== 401) invalidate(getBookings)
      notice('Nem sikerült', errorText(e), 'danger')
    }
    finally { setBusy(null) }
  }
  const noShow = () => showDialog({
    title: 'Nem jelent meg', message: `${b.name} – ${fmtTime(b.startsAt)}\n\nKésett (30 percnél többet), vagy egyáltalán nem jött el?`, tone: 'danger',
    buttons: [
      { text: 'Mégse', style: 'cancel' },
      { text: 'Késett', onPress: () => run('no-show', { reason: 'late' }) },
      { text: 'Nem jött el', style: 'destructive', onPress: () => run('no-show', { reason: 'no_show' }) },
    ],
  })

  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ width: 50, alignItems: 'flex-end', paddingTop: 14 }}>
        <Text style={{ color: active ? c.text : c.faint, fontFamily: f.semibold, fontSize: 15 }}>{fmtTime(b.startsAt)}</Text>
        <Text style={[s.small, { color: c.faint }]}>{fmtTime(b.endsAt)}</Text>
      </View>
      <View style={[s.card, { flex: 1, borderRadius: 16, padding: 14 }, running && { borderColor: c.rose }, !active && { opacity: 0.6 }]}>
        <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
          <Text style={[s.title, { flexShrink: 1 }]} numberOfLines={1}>{b.name}</Text>
          <Badge label={running ? 'Most zajlik' : label} color={running ? c.rose : color} soft={running ? c.roseSoft : soft} />
        </View>
        <Text style={s.muted}>{b.serviceName} · {huf(b.priceHuf)}</Text>

        {!gone && (paid > 0 || b.amountDueHuf > 0) && (
          <Money>
            {paid > 0
              ? <><Text style={{ fontFamily: f.semibold }}>Helyszínen: {huf(Math.max(0, b.priceHuf - paid))}</Text> · előleg ({huf(paid)}) levonva</>
              : `Előleg: ${huf(b.amountDueHuf)} · még nincs befizetve`}
          </Money>
        )}
        {gone && paid > 0 && (
          <Money color={b.refundStatus === 'review' ? c.gold : c.muted}>
            {b.refundStatus === 'review'
              ? <>Befizetett előleg: <Text style={{ fontFamily: f.semibold }}>{huf(paid)}</Text> · ha visszajár, utald vissza kézzel, és jelöld meg</>
              : b.refundStatus === 'refunded' ? `Előleg (${huf(paid)}) visszautalva` : `Befizetett előleg: ${huf(paid)}`}
          </Money>
        )}

        {b.noShowCount > 0 && <Text style={[s.small, { color: c.danger }]}>Korábban {b.noShowCount}× nem jelent meg</Text>}
        {!!b.customerNote && (
          <View style={[s.row, { alignItems: 'flex-start', flexWrap: 'nowrap' }]}>
            <StickyNote size={14} color={c.muted} strokeWidth={1.8} style={{ marginTop: 2 }} />
            <Text style={[s.small, { fontFamily: f.serifItalic, fontSize: 15, flex: 1 }]}>„{b.customerNote}”</Text>
          </View>
        )}
        <View style={[s.row, { marginTop: 6 }]}>
          {!!b.phone && <IconButton icon={Phone} label="Hívás" color={c.rose} onPress={() => Linking.openURL(`tel:${b.phone}`)} />}
          {!!b.email && <IconButton icon={Mail} label="E-mail" onPress={() => Linking.openURL(`mailto:${b.email}`)} />}
          <View style={{ flex: 1 }} />
          {b.status === 'booked' && started && <Button small label="Kész" icon={Check} busy={busy === 'complete'} onPress={() => run('complete')} />}
          {b.refundStatus === 'review' && (
            <Button small ghost label="Visszautalva" icon={Undo2} busy={busy === 'refunded'}
              onPress={async () => { if (await confirm('Előleg visszautalva?', `${b.name} – ${huf(paid)}. Csak akkor jelöld, ha már elutaltad.`, 'Visszautalva')) run('refunded') }} />
          )}
        </View>
        {active && (
          <View style={s.row}>
            {(b.status === 'pending_payment' || b.status === 'expired') && ['required', 'refund_needed'].includes(b.paymentStatus) &&
              <Button small label="Fizetés megjött" icon={Banknote} busy={busy === 'payment-confirmed'}
                onPress={async () => { if (await confirm('Fizetés megerősítése', `${b.name} befizetése megérkezett?`)) run('payment-confirmed') }} />}
            {b.status === 'booked' && !started && onItsDay && <Button small ghost label="Kész" icon={Check} busy={busy === 'complete'} onPress={() => run('complete')} />}
            {started && <Button small ghost label="Nem jött el" icon={UserX} busy={busy === 'no-show'} onPress={noShow} />}
            <Button small ghost danger label="Lemondás" icon={Ban} busy={busy === 'cancel'}
              onPress={async () => {
                const extra = paid > 0 ? `\n\nBefizetett előleg: ${huf(paid)} – ha visszajár, kézzel kell visszautalnod.` : ''
                if (await confirm('Foglalás lemondása', `${b.name}\n${fmtDayLong(dayKey(b.startsAt))}, ${fmtTime(b.startsAt)}${extra}`, 'Lemondás', true)) run('cancel')
              }} />
          </View>
        )}
      </View>
    </View>
  )
}

function Money({ children, color = c.gold }: { children: ReactNode; color?: string }) {
  return (
    <View style={[s.row, { flexWrap: 'nowrap', alignItems: 'flex-start' }]}>
      <Banknote size={14} color={color} strokeWidth={1.8} style={{ marginTop: 2 }} />
      <Text style={[s.small, { color, flex: 1 }]}>{children}</Text>
    </View>
  )
}
