import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CalendarOff, CalendarX, LockOpen, Sparkles, X } from 'lucide-react-native'
import { addBlockDay, ApiError, Block, Booking, bookingAction, Conflict, deleteBlock, errorText, getBookings } from '../api'
import { invalidate } from '../useLoad'
import { c, f, fmtDayLong, fmtTime, huf, s } from '../theme'
import { Button, DialogLayer, IconButton, confirm, dismissDialog, notice, showDialog, useLayout } from '../ui'
import { BookingCard, isActive } from './BookingCard'
import { saveInBackground, ToastLayer } from '../toast'

type Props = {
  day: string | null; today: string; bookings: Booking[]; blocks: Block[]; fullDayBlocked: boolean; closed: boolean; now: number
  onClose: () => void
  onBookingUpdated: (b: Booking, confirmed?: boolean) => void
  onBlockAdded: (b: Block) => void
  onBlockRemoved: (id: string) => void
}

// A panel ennyivel nyúlik a képernyő alja alá, hogy rugózáskor / felfelé húzáskor se látszódjon az alja
const UNDER = 120
const DESKTOP_SHIFT = 28

/**
 * A nap foglalásai időrendben + szabadnap kezelése.
 * Telefonon / tableten a képernyő aljából felcsúszó panel (fogantyúra koppintva vagy lehúzva zárul),
 * asztali nézetben középen lebegő ablak.
 */
export function DaySheet({ day, today, bookings, blocks, fullDayBlocked, closed, now, onClose, onBookingUpdated, onBlockAdded, onBlockRemoved }: Props) {
  const insets = useSafeAreaInsets()
  const { height, width, desktop, tablet } = useLayout()
  const [busy, setBusy] = useState(false)
  const travel = desktop ? DESKTOP_SHIFT : height
  const y = useRef(new Animated.Value(travel)).current
  const closing = useRef(false)

  useEffect(() => {
    if (!day) return
    closing.current = false
    y.setValue(travel)
    Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 30, stiffness: 280, mass: 1, overshootClamping: true }).start()
  }, [day]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeRef = useRef(() => {})
  closeRef.current = () => {
    if (closing.current) return
    closing.current = true
    Animated.timing(y, { toValue: travel, duration: desktop ? 160 : 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => onClose())
  }
  const close = () => closeRef.current()
  const settle = () => Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 30, stiffness: 300, overshootClamping: true }).start()

  // Lefelé húzás a fogantyún / fejlécen; a fogantyúra koppintás is zár
  const makePan = (tapCloses: boolean) => PanResponder.create({
    onStartShouldSetPanResponder: () => tapCloses,
    onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => y.setValue(g.dy > 0 ? g.dy : Math.max(-UNDER / 2, g.dy / 6)),
    onPanResponderRelease: (_, g) => {
      if (tapCloses && Math.abs(g.dy) < 6 && Math.abs(g.dx) < 6) return closeRef.current()
      if (g.dy > 110 || g.vy > 0.8) return closeRef.current()
      settle()
    },
    onPanResponderTerminate: settle,
  })
  const handlePan = useMemo(() => makePan(true), []) // eslint-disable-line react-hooks/exhaustive-deps
  const headerPan = useMemo(() => makePan(false), []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!day) return null

  const active = bookings.filter(isActive)
  const counted = bookings.filter((b) => b.status !== 'cancelled' && b.status !== 'expired' && b.status !== 'no_show')
  const income = counted.reduce((sum, b) => sum + b.priceHuf, 0)
  const prepaid = counted.reduce((sum, b) => sum + Math.min(b.amountPaidHuf || 0, b.priceHuf), 0)
  const past = day < today
  // Ha már dolgoztál aznap (teljesült / nem jött el) és nincs több aktív foglalás, a szabadnapnak nincs értelme
  const worked = bookings.some((b) => b.status === 'completed' || b.status === 'no_show')
  const canBlock = !past && !fullDayBlocked && (active.length > 0 || !worked)

  async function blockDay() {
    if (active.length === 0) {
      if (!(await confirm('Szabadnap', `${fmtDayLong(day!)} – erre a napra nem lehet majd foglalni.`, 'Letiltás'))) return
      setBusy(true)
      try {
        onBlockAdded(await addBlockDay(day!, 'Szabadnap'))
      } catch (e) {
        // Közben foglalás érkezett (a lista elavult): a szerver friss listájával jön a sürgős párbeszéd
        if (e instanceof ApiError && e.code === 'block_has_bookings') { invalidate(getBookings); urgent(e.data.bookings as Conflict[], true) }
        else notice('Nem sikerült', errorText(e), 'danger')
      } finally { setBusy(false) }
      return
    }
    urgent(active, false)
  }

  function urgent(list: Conflict[], arrivedMeanwhile: boolean) {
    const names = list.map((b) => `${fmtTime(b.startsAt)}  ${b.name}  ${b.phone}`).join('\n')
    const intro = arrivedMeanwhile ? `Közben foglalás érkezett erre a napra (${list.length}):` : `Erre a napra ${list.length} aktív foglalás van:`
    showDialog({
      title: 'Sürgős szabadnap', tone: 'danger',
      message: `${intro}\n\n${names}\n\nA nap mindenképp letiltásra kerül. A foglalásokat is lemondjam?`,
      buttons: [
        { text: 'Mégse', style: 'cancel' },
        { text: 'Csak letiltás', onPress: () => withBusy(async () => onBlockAdded(await addBlockDay(day!, 'Sürgős szabadnap', true))) },
        {
          text: 'Letiltás + lemondás', style: 'destructive', onPress: () => withBusy(async () => {
            onBlockAdded(await addBlockDay(day!, 'Sürgős szabadnap', true))
            const cancelled = await Promise.all(list.map((b) => bookingAction(b.id, 'cancel', { reason: 'urgent_block' })))
            cancelled.forEach((b) => onBookingUpdated(b, true))
            notice('Kész', `A nap letiltva, ${list.length} foglalás lemondva.\n\nKérlek, hívd fel a vendégeket:\n${names}`, 'ok')
          }),
        },
      ],
    })
  }

  async function unblock(block: Block) {
    if (!(await confirm('Tiltás feloldása', 'Erre az időre újra lehet majd foglalni.', 'Feloldás'))) return
    // Azonnal eltűnik, a törlés a háttérben megy; hibánál visszakerül
    onBlockRemoved(block.id)
    saveInBackground(() => deleteBlock(block.id), { failed: () => onBlockAdded(block) })
  }

  async function withBusy(task: () => Promise<unknown>) {
    setBusy(true)
    try { await task() } catch (e) { notice('Nem sikerült', errorText(e), 'danger') }
    finally { setBusy(false) }
  }

  const backdropOpacity = y.interpolate({ inputRange: [0, travel], outputRange: [1, 0], extrapolate: 'clamp' })
  const panelStyle = desktop
    ? {
        width: Math.min(600, width - 64), maxHeight: height * 0.86, borderRadius: 28, borderWidth: 1, paddingBottom: 16,
        opacity: backdropOpacity, transform: [{ translateY: y }, { scale: y.interpolate({ inputRange: [0, DESKTOP_SHIFT], outputRange: [1, 0.97], extrapolate: 'clamp' }) }],
      }
    : {
        width: tablet ? Math.min(720, width - 48) : width, alignSelf: 'center' as const, maxHeight: height * 0.9 + UNDER,
        borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0,
        marginBottom: -UNDER, paddingBottom: insets.bottom + 12 + UNDER, transform: [{ translateY: y }],
      }

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => { if (!dismissDialog()) close() }} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, justifyContent: desktop ? 'center' : 'flex-end', alignItems: desktop ? 'center' : 'stretch' }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,3,4,0.66)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Bezárás" />
        </Animated.View>
        <Animated.View style={[{ backgroundColor: c.bg, borderColor: c.line, overflow: 'hidden' }, panelStyle]}>
          {!desktop && (
            <View {...handlePan.panHandlers} accessibilityRole="button" accessibilityLabel="Panel bezárása"
              style={{ alignSelf: 'center', paddingHorizontal: 48, paddingTop: 10, paddingBottom: 8 }}>
              <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: c.berry }} />
            </View>
          )}
          <View {...(desktop ? {} : headerPan.panHandlers)}
            style={[s.row, { flexWrap: 'nowrap', alignItems: 'flex-start', paddingHorizontal: desktop ? 26 : 20, paddingTop: desktop ? 24 : 6, paddingBottom: 12 }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.eyebrow}>{day === today ? 'Ma' : past ? 'Elmúlt nap' : 'Napirend'}</Text>
              <Text style={s.h2}>{fmtDayLong(day)}</Text>
              <Text style={s.muted}>{bookings.length ? `${active.length} aktív foglalás${income ? ` · ${huf(income)}` : ''}` : 'Nincs foglalás'}</Text>
              {prepaid > 0 && <Text style={[s.small, { color: c.gold }]}>Helyszínen: {huf(income - prepaid)} · előleg ({huf(prepaid)}) már befizetve</Text>}
            </View>
            {desktop && <IconButton icon={X} label="Bezárás" onPress={close} />}
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: desktop ? 26 : 20, paddingBottom: 16, gap: 12 }}>
            {closed && <Banner icon={Sparkles} color={c.gold} title="Ünnepi szünnap" text="Erre a napra a weboldalon nem lehet foglalni." />}
            {blocks.map((b) => {
              const whole = fullDayBlocked && fmtTime(b.startsAt) === '00:00'
              return (
                <View key={b.id} style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.dangerSoft, borderColor: 'rgba(224,122,122,0.3)' }]}>
                  <CalendarOff size={22} color={c.danger} strokeWidth={1.8} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.title, { color: c.danger }]}>{whole ? 'Szabadnap' : `Letiltva ${fmtTime(b.startsAt)}–${fmtTime(b.endsAt)}`}</Text>
                    {!!b.reason && b.reason !== 'Szabadnap' && <Text style={s.small}>{b.reason}</Text>}
                  </View>
                  {!past && <Button small ghost label="Feloldás" icon={LockOpen} busy={busy} onPress={() => unblock(b)} />}
                </View>
              )
            })}

            {bookings.length === 0 && !blocks.length && (
              <View style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
                <CalendarX size={36} color={c.faint} strokeWidth={1.4} />
                <Text style={s.muted}>Erre a napra nincs foglalás.</Text>
              </View>
            )}
            {bookings.map((b) => <BookingCard key={b.id} booking={b} now={now} onUpdated={onBookingUpdated} />)}
          </ScrollView>

          {canBlock && (
            <View style={{ paddingHorizontal: desktop ? 26 : 20, paddingTop: 8 }}>
              {active.length
                ? <Button ghost danger label="Sürgős szabadnap" icon={CalendarOff} busy={busy} onPress={blockDay} />
                : <Button label="Szabadnap erre a napra" icon={CalendarOff} busy={busy} onPress={blockDay} />}
            </View>
          )}
        </Animated.View>
        <DialogLayer />
        <ToastLayer />
      </View>
    </Modal>
  )
}

function Banner({ icon: Icon, color, title, text }: { icon: typeof Sparkles; color: string; title: string; text: string }) {
  return (
    <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
      <Icon size={22} color={color} strokeWidth={1.8} />
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color, fontFamily: f.medium }]}>{title}</Text>
        <Text style={s.small}>{text}</Text>
      </View>
    </View>
  )
}
