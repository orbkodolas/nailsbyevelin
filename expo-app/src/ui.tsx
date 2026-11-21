import { useEffect, useRef, useState, type ComponentType } from 'react'
import { ActivityIndicator, Animated, BackHandler, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { c, f, s } from './theme'

export type IconType = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

/** Képernyőméret-kategóriák: telefon < 600 ≤ tablet < 1000 ≤ asztali (laptop/monitor). */
export function useLayout() {
  const { width, height } = useWindowDimensions()
  const desktop = width >= 1000
  const tablet = !desktop && width >= 600
  return { width, height, phone: !tablet && !desktop, tablet, desktop, wide: tablet || desktop, gutter: desktop ? 32 : tablet ? 28 : 20 }
}

export function Button({ label, onPress, ghost, danger, busy, icon: Icon, small }: {
  label: string; onPress: () => void; ghost?: boolean; danger?: boolean; busy?: boolean; icon?: IconType; small?: boolean
}) {
  const color = ghost ? (danger ? c.danger : c.text) : danger ? '#fff' : c.bg
  return (
    <Pressable onPress={onPress} disabled={busy} hitSlop={4}
      style={({ pressed }) => [ghost ? s.ghost : s.btn, danger && (ghost ? { borderColor: 'rgba(224,122,122,0.45)' } : { backgroundColor: c.danger }), small && { paddingVertical: 8, paddingHorizontal: 12 }, (pressed || busy) && { opacity: 0.6 }]}>
      {busy ? <ActivityIndicator color={color} /> : (
        <>
          {Icon && <Icon size={small ? 15 : 17} color={color} strokeWidth={1.8} />}
          <Text style={[ghost ? s.ghostText : s.btnText, { color }, small && { fontSize: 13 }]}>{label}</Text>
        </>
      )}
    </Pressable>
  )
}

export function IconButton({ icon: Icon, onPress, label, color = c.text, tint, size = 40, outline }: { icon: IconType; onPress: () => void; label: string; color?: string; tint?: string; size?: number; outline?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={6}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: tint ?? c.raised, borderWidth: 1, borderColor: outline ?? c.line }, pressed && { opacity: 0.6 }]}>
      <Icon size={size < 40 ? 16 : 18} color={color} strokeWidth={1.8} />
    </Pressable>
  )
}

export function Badge({ label, color, soft }: { label: string; color: string; soft?: string }) {
  return (
    <View style={{ backgroundColor: soft ?? 'transparent', borderColor: color, borderWidth: soft ? 0 : 1, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3 }}>
      <Text style={{ color, fontSize: 11, fontFamily: f.medium, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  )
}

// ---- Saját párbeszédablakok (a rendszer Alert helyett) ----
// Több réteg lehet (az app gyökere + minden Modal belseje); mindig a legutóbb csatolt réteg jeleníti meg,
// így a felcsúszó panel fölött is jó helyen jelenik meg, Modal-a-Modalban nélkül.

export type DialogButton = { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }
type DialogOpts = { title: string; message?: string; buttons?: DialogButton[]; tone?: 'danger' | 'ok' }
type Layer = { show: (d: DialogOpts) => void; dismiss: () => boolean }
const layers: Layer[] = []
const pending: DialogOpts[] = []

/** Párbeszédablak; gombok nélkül egy „Rendben” gombbal. */
export function showDialog(opts: DialogOpts) {
  const top = layers[layers.length - 1]
  if (top) top.show(opts)
  else pending.push(opts)
}
/** Hibaüzenet / tájékoztatás egy gombbal. */
export const notice = (title: string, message?: string, tone?: DialogOpts['tone']) => showDialog({ title, message, tone })
/** A legfelső nyitott ablak bezárása (Android vissza gomb); true, ha volt mit bezárni. */
export const dismissDialog = () => layers[layers.length - 1]?.dismiss() ?? false

/** Megerősítő párbeszéd; true, ha jóváhagyták. */
export const confirm = (title: string, message: string, ok = 'Igen', destructive = false) =>
  new Promise<boolean>((resolve) => showDialog({
    title, message, tone: destructive ? 'danger' : undefined,
    buttons: [{ text: 'Mégse', style: 'cancel', onPress: () => resolve(false) }, { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) }],
  }))

/** Réteg, ahol a párbeszédablakok megjelennek; a gyökérbe és minden Modal tartalmának végére kell tenni. */
export function DialogLayer({ handleBack = false }: { handleBack?: boolean }) {
  const [queue, setQueue] = useState<DialogOpts[]>([])
  const anim = useRef(new Animated.Value(0)).current
  const current = queue[0]
  const { width } = useWindowDimensions()
  const currentRef = useRef<DialogOpts | undefined>(current)
  currentRef.current = current

  function choose(button?: DialogButton) {
    currentRef.current = undefined
    setQueue((q) => q.slice(1))
    button?.onPress?.()
  }
  const chooseRef = useRef(choose)
  chooseRef.current = choose

  useEffect(() => {
    const layer: Layer = {
      show: (d) => setQueue((q) => [...q, d]),
      dismiss: () => {
        const open = currentRef.current
        if (!open) return false
        chooseRef.current(cancelOf(open))
        return true
      },
    }
    layers.push(layer)
    if (pending.length) setQueue((q) => [...q, ...pending.splice(0)])
    return () => { layers.splice(layers.indexOf(layer), 1) }
  }, [])

  useEffect(() => {
    if (!current) return
    anim.setValue(0)
    Animated.timing(anim, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [current, anim])

  useEffect(() => {
    if (!handleBack || !current) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { choose(cancelOf(current)); return true })
    return () => sub.remove()
  }) // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null
  const buttons = current.buttons?.length ? current.buttons : [{ text: 'Rendben' }]
  const stacked = buttons.length > 2
  const accent = current.tone === 'danger' ? c.danger : current.tone === 'ok' ? c.ok : c.rose

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000 }]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,3,4,0.72)', opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => choose(cancelOf(current))} accessibilityLabel="Bezárás" />
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: 24 }]} pointerEvents="box-none">
        <Animated.View accessibilityRole="alert" style={{
          width: Math.min(width - 48, 420), backgroundColor: c.raised, borderRadius: 24, borderWidth: 1, borderColor: c.line, padding: 22, gap: 10,
          opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
          shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 30, shadowOffset: { width: 0, height: 12 },
        }}>
          <View style={{ width: 28, height: 3, borderRadius: 2, backgroundColor: accent }} />
          <Text style={[s.h2, { fontSize: 24, lineHeight: 28 }]}>{current.title}</Text>
          {!!current.message && <Text style={[s.text, { color: c.muted, lineHeight: 22 }]}>{current.message}</Text>}
          <View style={[{ marginTop: 10, gap: 8 }, stacked ? { flexDirection: 'column-reverse' } : { flexDirection: 'row', justifyContent: 'flex-end' }]}>
            {buttons.map((b, i) => (
              <View key={i} style={stacked ? undefined : { flexShrink: 1, minWidth: buttons.length === 1 ? 120 : undefined }}>
                <Button label={b.text} ghost={b.style === 'cancel'} danger={b.style === 'destructive'} onPress={() => choose(b)} />
              </View>
            ))}
          </View>
        </Animated.View>
      </View>
    </View>
  )
}

const cancelOf = (d?: DialogOpts) => d?.buttons?.find((b) => b.style === 'cancel')
