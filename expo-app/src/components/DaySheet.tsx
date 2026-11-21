import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Modal, PanResponder, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CalendarCheck, CalendarOff, CalendarX, LockOpen, Moon, Pencil, Sparkles, X } from 'lucide-react-native'
import { addBlock, addOpening, ApiError, Block, BlockRequest, Booking, bookingAction, Conflict, deleteBlock, deleteOpening, errorText, getBookings, Opening } from '../api'
import { DayInfo, toTime } from '../schedule'
import { CloseDraft, CloseEditor, closeRequest, fmtDayShort, initialClose, initialOpen, OpenEditor } from './DayEditor'
import { invalidate } from '../useLoad'
import { c, dayKey, f, fmtDayLong, fmtTime, huf, s } from '../theme'
import { Button, DialogLayer, IconButton, confirm, dismissDialog, notice, showDialog, useLayout } from '../ui'
import { BookingCard, isActive } from './BookingCard'
import { saveInBackground, ToastLayer } from '../toast'

type Props = {
  day: string | null; today: string; bookings: Booking[]; blocks: Block[]; fullDayBlocked: boolean; info: DayInfo | null; now: number
  onClose: () => void
  onOpeningSaved: (o: Opening) => void
  onOpeningRemoved: (id: string) => void
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
export function DaySheet({ day, today, bookings, blocks, fullDayBlocked, info, now, onClose, onBookingUpdated, onBlockAdded, onBlockRemoved, onOpeningSaved, onOpeningRemoved }: Props) {
  const insets = useSafeAreaInsets()
  const { height, width, desktop, tablet } = useLayout()
  const [busy, setBusy] = useState(false)
  // Szerkesztő: zárás (egész nap / időszak / több nap) vagy nyitás zárt napon
  const [editor, setEditor] = useState<null | 'close' | 'open'>(null)
  const [closeDraft, setCloseDraft] = useState<CloseDraft | null>(null)
  const [openDraft, setOpenDraft] = useState<[number, number]>([540, 1080])
  const scrollRef = useRef<ScrollViewInstance>(null)
  useEffect(() => { setEditor(null) }, [day])
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

  if (!day || !info) return null

  // A lemondott és már visszautaltnak jelölt foglalásnak nincs több teendője: nem tartjuk a napirenden
  const shown = bookings.filter((b) => !(b.status === 'cancelled' && b.refundStatus === 'refunded'))
  const active = bookings.filter(isActive)
  const counted = bookings.filter((b) => b.status !== 'cancelled' && b.status !== 'expired' && b.status !== 'no_show')
  const income = counted.reduce((sum, b) => sum + b.priceHuf, 0)
  const prepaid = counted.reduce((sum, b) => sum + Math.min(b.amountPaidHuf || 0, b.priceHuf), 0)
  const past = day < today
  const isOpen = info.hours.length > 0
  const canClose = !past && isOpen && !fullDayBlocked
  const canOpen = !past && !isOpen && !fullDayBlocked
  const workText = info.hours.map(([a, b]) => `${a}–${b}`).join(', ')

  function startEditor(kind: 'close' | 'open') {
    if (kind === 'close') setCloseDraft(initialClose(day!, info!))
    else setOpenDraft(initialOpen(info!))
    setEditor(kind)
    scrollRef.current?.scrollTo({ y: 0, animated: true })
  }

  async function save() {
    if (editor === 'open') return withBusy(async () => { onOpeningSaved(await addOpening(day!, toTime(openDraft[0]), toTime(openDraft[1]))); setEditor(null) })
    if (!closeDraft) return
    // A napon már ismert aktív foglalások: rögtön megkérdezzük, mi legyen velük (több napnál a szerver nézi meg)
    const hit = closeDraft.kind === 'multi' ? [] : active.filter((b) => closeDraft.kind === 'day' || (fmtTime(b.startsAt) < toTime(closeDraft.end) && fmtTime(b.endsAt) > toTime(closeDraft.start)))
    if (hit.length) return urgent(hit, closeDraft, false)
    setBusy(true)
    try {
      onBlockAdded(await addBlock(closeRequest(day!, closeDraft)))
      setEditor(null)
    } catch (e) {
      // Közben foglalás érkezett (a lista elavult) vagy más napra esik: a szerver listájával jön a döntés
      if (e instanceof ApiError && e.code === 'block_has_bookings') { invalidate(getBookings); urgent(e.data.bookings as Conflict[], closeDraft, true) }
      else notice('Nem sikerült', errorText(e), 'danger')
    } finally { setBusy(false) }
  }

  function urgent(list: Conflict[], draft: CloseDraft, fromServer: boolean) {
    const names = list.map((b) => `${draft.kind === 'multi' ? `${fmtDayShort(dayKey(b.startsAt))} ` : ''}${fmtTime(b.startsAt)}  ${b.name}  ${b.phone}`).join('\n')
    const intro = fromServer && draft.kind !== 'multi' ? `Közben foglalás érkezett erre az időre (${list.length}):` : `A kiválasztott időben ${list.length} aktív foglalás van:`
    const req: BlockRequest = closeRequest(day!, draft, true)
    showDialog({
      title: 'Foglalások a zárás idején', tone: 'danger',
      message: `${intro}\n\n${names}\n\nA zárás mindenképp megtörténik. A foglalásokat is lemondjam?`,
      buttons: [
        { text: 'Mégse', style: 'cancel' },
        { text: 'Csak zárás', onPress: () => withBusy(async () => { onBlockAdded(await addBlock(req)); setEditor(null) }) },
        {
          text: 'Zárás + lemondás', style: 'destructive', onPress: () => withBusy(async () => {
            onBlockAdded(await addBlock(req))
            setEditor(null)
            const cancelled = await Promise.all(list.map((b) => bookingAction(b.id, 'cancel', { reason: 'urgent_block' })))
            cancelled.forEach((b) => onBookingUpdated(b, true))
            notice('Kész', `Lezárva, ${list.length} foglalás lemondva.\n\nKérlek, hívd fel a vendégeket:\n${names}`, 'ok')
          }),
        },
      ],
    })
  }

  async function unblock(block: Block, span: number) {
    const text = span > 1 ? `Az egész szabadság (${span} nap) feloldódik, ezekre a napokra újra lehet foglalni.` : 'Erre az időre újra lehet majd foglalni.'
    if (!(await confirm('Tiltás feloldása', text, 'Feloldás'))) return
    // Azonnal eltűnik, a törlés a háttérben megy; hibánál visszakerül
    onBlockRemoved(block.id)
    saveInBackground(() => deleteBlock(block.id), { failed: () => onBlockAdded(block) })
  }

  async function closeOpening(o: Opening) {
    const kept = active.length ? ` A meglévő ${active.length} foglalás megmarad.` : ''
    if (!(await confirm('Nap visszazárása', `A weboldalon erre a napra újra nem lehet foglalni.${kept}`, 'Visszazárás'))) return
    onOpeningRemoved(o.id)
    saveInBackground(() => deleteOpening(o.id), { failed: () => onOpeningSaved(o) })
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
              {info.holiday && <Text style={[s.title, { color: c.gold, fontFamily: f.medium }]}>{info.holiday}</Text>}
              <Text style={s.muted}>{isOpen ? `Munkaidő ${workText}` : 'Zárva'} · {shown.length ? `${active.length} aktív foglalás${income ? ` · ${huf(income)}` : ''}` : 'nincs foglalás'}</Text>
              {prepaid > 0 && <Text style={[s.small, { color: c.gold }]}>Helyszínen: {huf(income - prepaid)} · előleg ({huf(prepaid)}) már befizetve</Text>}
            </View>
            {desktop && <IconButton icon={X} label="Bezárás" onPress={close} />}
          </View>

          <ScrollView ref={scrollRef} style={{ flexShrink: 1, alignSelf: 'stretch' }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: desktop ? 26 : 20, paddingBottom: 16, gap: 12 }}>
            {editor && (
              <View style={[s.card, { gap: 14, borderColor: editor === 'open' ? 'rgba(143,196,160,0.35)' : c.line }]}>
                <Text style={s.title}>{editor === 'open' ? 'Munka nyitása' : 'Zárás / szabadság'}</Text>
                {editor === 'open'
                  ? <OpenEditor info={info} start={openDraft[0]} end={openDraft[1]} onChange={(a, b) => setOpenDraft([a, b])} />
                  : closeDraft && <CloseEditor day={day} info={info} value={closeDraft} onChange={setCloseDraft} />}
              </View>
            )}
            {!editor && info.opening && (
              <Banner icon={CalendarCheck} color={c.ok} title={`Nyitva ${info.opening.start}–${info.opening.end}`}
                text={info.ruleClosed ? `${info.ruleClosed === 'holiday' ? 'Ünnepnap' : 'Szünnap'}, de erre az időre lehet foglalni.` : 'Egyedi nyitás: erre az időre lehet foglalni.'}
                actions={!past ? <>
                  <Button small ghost label="Módosítás" icon={Pencil} onPress={() => startEditor('open')} />
                  <Button small ghost label="Visszazárás" icon={CalendarOff} onPress={() => closeOpening(info.opening!)} />
                </> : undefined} />
            )}
            {!editor && !info.opening && info.ruleClosed && (
              <Banner icon={Sparkles} color={c.gold} title={info.ruleClosed === 'holiday' ? 'Ünnepnap – zárva' : 'Szünnap – zárva'}
                text={past ? 'Ezen a napon zárva voltál.' : 'A weboldalon erre a napra nem lehet foglalni. Ha mégis dolgoznál, nyisd meg lent.'} />
            )}
            {!editor && !info.opening && !info.ruleClosed && !isOpen && (
              <Banner icon={Moon} color={c.muted} title="Pihenőnap" text={past ? 'Ezen a napon nem volt munkaidő.' : 'Ezen a napon nincs munkaidő. Ha mégis dolgoznál, nyisd meg lent.'} />
            )}
            {blocks.map((b) => {
              const first = dayKey(b.startsAt)
              const last = dayKey(new Date(Date.parse(b.endsAt) - 1).toISOString())
              const span = Math.round((Date.parse(`${last}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86_400_000) + 1
              const whole = fullDayBlocked && fmtTime(b.startsAt) === '00:00'
              const title = span > 1 ? `Szabadság · ${fmtDayShort(first)} – ${fmtDayShort(last)}` : whole ? 'Szabadnap' : `Zárva ${fmtTime(b.startsAt)}–${fmtTime(b.endsAt)}`
              return (
                <View key={b.id} style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.dangerSoft, borderColor: 'rgba(224,122,122,0.3)' }]}>
                  <CalendarOff size={22} color={c.danger} strokeWidth={1.8} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.title, { color: c.danger }]}>{title}</Text>
                    {span > 1 && <Text style={s.small}>{span} nap</Text>}
                    {!!b.reason && !['Szabadnap', 'Szabadság'].includes(b.reason) && <Text style={s.small}>{b.reason}</Text>}
                  </View>
                  {dayKey(new Date(Date.parse(b.endsAt) - 1).toISOString()) >= today && <Button small ghost label="Feloldás" icon={LockOpen} busy={busy} onPress={() => unblock(b, span)} />}
                </View>
              )
            })}

            {shown.length === 0 && !blocks.length && !editor && (
              <View style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
                <CalendarX size={36} color={c.faint} strokeWidth={1.4} />
                <Text style={s.muted}>Erre a napra nincs foglalás.</Text>
              </View>
            )}
            {shown.map((b) => <BookingCard key={b.id} booking={b} now={now} onUpdated={onBookingUpdated} />)}
          </ScrollView>

          {editor ? (
            <View style={{ paddingHorizontal: desktop ? 26 : 20, paddingTop: 8, flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button ghost label="Mégse" onPress={() => setEditor(null)} /></View>
              <View style={{ flex: 2 }}>
                <Button label={editor === 'open' ? 'Nyitás mentése' : closeDraft?.kind === 'multi' ? 'Szabadság mentése' : closeDraft?.kind === 'range' ? 'Időszak lezárása' : 'Nap lezárása'}
                  icon={editor === 'open' ? CalendarCheck : CalendarOff} busy={busy} onPress={save} />
              </View>
            </View>
          ) : (canClose || canOpen) && (
            <View style={{ paddingHorizontal: desktop ? 26 : 20, paddingTop: 8 }}>
              {canOpen
                ? <Button label={info.ruleClosed === 'holiday' ? 'Munka nyitása az ünnepnapon' : 'Munka nyitása erre a napra'} icon={CalendarCheck} onPress={() => startEditor('open')} />
                : <Button ghost={active.length > 0} label="Zárás / szabadság" icon={CalendarOff} onPress={() => startEditor('close')} />}
            </View>
          )}
        </Animated.View>
        <DialogLayer />
        <ToastLayer />
      </View>
    </Modal>
  )
}

function Banner({ icon: Icon, color, title, text, actions }: { icon: typeof Sparkles; color: string; title: string; text: string; actions?: ReactNode }) {
  return (
    <View style={[s.card, { gap: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon size={22} color={color} strokeWidth={1.8} />
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color, fontFamily: f.medium }]}>{title}</Text>
          <Text style={s.small}>{text}</Text>
        </View>
      </View>
      {actions && <View style={[s.row, { justifyContent: 'flex-end' }]}>{actions}</View>}
    </View>
  )
}
