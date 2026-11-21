import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check } from 'lucide-react-native'
import { errorText } from './api'
import { c, f } from './theme'
import { notice } from './ui'

/**
 * Kompakt, felülről beúszó visszajelzés („Mentve”), és háttérmentés: a művelet azonnal látszik az appban,
 * a kérés a háttérben fut (alvó szerver ébredésekor ez 15–50 mp is lehet), közben az app szabadon használható.
 *
 * Több réteg lehet (az app gyökere + minden Modal belseje, mert az Android Modal külön ablak);
 * mindig a legutóbb csatolt réteg mutatja, így a panel bezárása után a gyökér veszi át a még futó jelzést.
 */
type Tone = 'ok' | 'pending'
type Toast = { id: number; text: string; tone: Tone }
let current: Toast | null = null
let seq = 0
let hideTimer: ReturnType<typeof setTimeout> | undefined
const layers: Array<() => void> = []
const render = () => layers[layers.length - 1]?.()

function show(text: string, tone: Tone) {
  clearTimeout(hideTimer)
  current = { id: ++seq, text, tone }
  if (tone === 'ok') hideTimer = setTimeout(() => { current = null; render() }, 2200)
  render()
}
function hide() { clearTimeout(hideTimer); current = null; render() }

// Egymás után futnak, hogy ugyanarra a foglalásra kért műveletek sorrendje megmaradjon
let chain: Promise<unknown> = Promise.resolve()
let running = 0

/**
 * Háttérmentés: a hívó előbb helyben frissíti az adatot, ez pedig elküldi a kérést.
 * Ha 1,2 mp alatt nem végez, „Mentés…” jelzés jelenik meg; siker után zöld „Mentve”, hiba esetén
 * a hívó visszaállítja az eredeti állapotot (failed), és hibaablak jön.
 */
export function saveInBackground<T>(task: () => Promise<T>, opts: { done?: (result: T) => void; failed?: (e: unknown) => void; okText?: string } = {}) {
  running++
  const slow = setTimeout(() => { if (current?.tone !== 'pending') show('Mentés… a szerver ébred', 'pending') }, 1200)
  const run = chain.then(task)
  chain = run.catch(() => {})
  run.then(
    (result) => {
      clearTimeout(slow); running--
      opts.done?.(result)
      if (running === 0) show(opts.okText ?? 'Mentve', 'ok')
    },
    (e) => {
      clearTimeout(slow); running--
      if (running === 0 && current?.tone === 'pending') hide()
      opts.failed?.(e)
      notice('Nem sikerült menteni', errorText(e), 'danger')
    },
  )
}

/** A gyökérbe és minden Modal tartalmának végére kell tenni (a DialogLayer mellé). */
export function ToastLayer() {
  const [, force] = useState(0)
  const insets = useSafeAreaInsets()
  const anim = useRef(new Animated.Value(0)).current
  const shownRef = useRef<Toast | null>(null)
  const leaving = useRef(false)
  const self = useRef(() => force((n) => n + 1)).current

  useEffect(() => {
    layers.push(self)
    render()
    return () => { layers.splice(layers.indexOf(self), 1); render() }
  }, [self])

  const isTop = layers[layers.length - 1] === self
  const target = isTop ? current : null
  useEffect(() => {
    if (target) {
      // Új jelzés beúszik; a „Mentés…” → „Mentve” váltás helyben cserél, nem úszik ki-be újra
      const wasLeaving = leaving.current
      leaving.current = false
      if (!shownRef.current) anim.setValue(0)
      if (!shownRef.current || wasLeaving) { anim.stopAnimation(); Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 260, mass: 0.8 }).start() }
      shownRef.current = target
    } else if (shownRef.current && !leaving.current) {
      leaving.current = true
      Animated.timing(anim, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
        if (!leaving.current) return
        shownRef.current = null; leaving.current = false; force((n) => n + 1)
      })
    }
  }, [target, anim])

  const shown = target ?? shownRef.current
  if (!shown) return null
  const ok = shown.tone === 'ok'
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 2000, elevation: 2000, alignItems: 'center' }]}>
      <Animated.View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{
        marginTop: insets.top + 10, flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 14, paddingVertical: 9, borderRadius: 99, borderWidth: 1,
        backgroundColor: ok ? '#1d2b22' : c.raised, borderColor: ok ? 'rgba(143,196,160,0.45)' : c.line,
        shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
        opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-48, 0] }) }, { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
      }}>
        {ok
          ? <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c.ok, alignItems: 'center', justifyContent: 'center' }}><Check size={12} color="#10170f" strokeWidth={3} /></View>
          : <ActivityIndicator size="small" color={c.muted} />}
        <Text style={{ color: ok ? c.ok : c.text, fontFamily: f.medium, fontSize: 14 }}>{shown.text}</Text>
      </Animated.View>
    </View>
  )
}
