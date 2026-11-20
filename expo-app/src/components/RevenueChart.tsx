import { useRef, useState } from 'react'
import { Pressable, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import { ZoomIn } from 'lucide-react-native'
import { c, f, huf, s } from '../theme'

export type Point = { key: string; axis: string; label: string; value: number; count: number; names?: string[]; zoomable: boolean }

const H = 230
const PAD = { left: 46, right: 16, bottom: 26 }

/** "45e", "1,2M" – tengelyfeliratokhoz és buborékokhoz */
export const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('hu-HU', { maximumFractionDigits: 1 })}M` : n >= 1000 ? `${(n / 1000).toLocaleString('hu-HU', { maximumFractionDigits: 1 })}e` : String(n)

function niceTop(max: number) {
  if (max <= 0) return { top: 10_000, step: 5_000 }
  const raw = max / 3
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].find((m) => m * mag >= raw)! * mag
  return { top: Math.ceil(max / step) * step, step }
}

type Props = {
  points: Point[]
  onZoomIn: (index: number) => void
  onZoomOut: () => void
  /** Húzás közben az oldal görgetését letiltjuk, hogy a görbe kapja a mozdulatot */
  onTouchActive: (active: boolean) => void
}

/**
 * Tőzsdei stílusú bevételgörbe. Egy ujj: szálkereszt + értékbuborék (az oldal ilyenkor nem görget).
 * Széthúzás két ujjal / dupla koppintás: nagyítás a pontra (részletesebb bontás); összecsípés: kicsinyítés.
 * Kevés pontnál minden nem nulla pont fölött lebegő buborék mutatja az értéket (órás nézetben a vendég nevét).
 */
export function RevenueChart({ points, onZoomIn, onZoomOut, onTouchActive }: Props) {
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)
  const pinch = useRef<{ start: number; done: boolean } | null>(null)
  const lastTap = useRef(0)
  const moved = useRef(false)
  const startX = useRef(0)

  const n = points.length
  const index = Math.min(active ?? n - 1, n - 1)
  const nonZero = points.filter((p) => p.value > 0).length
  const bubbles = nonZero > 0 && nonZero <= 8
  const padTop = bubbles ? 40 : 14
  const plotW = Math.max(1, width - PAD.left - PAD.right)
  const plotH = H - padTop - PAD.bottom
  const { top, step } = niceTop(Math.max(0, ...points.map((p) => p.value)))
  const xAt = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1))
  const yAt = (v: number) => padTop + plotH - (v / top) * plotH
  const indexAt = (x: number) => Math.max(0, Math.min(n - 1, n <= 1 ? 0 : Math.round(((x - PAD.left) / plotW) * (n - 1))))

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(' ')
  const area = n > 1 ? `${line} L${xAt(n - 1).toFixed(1)},${yAt(0)} L${xAt(0).toFixed(1)},${yAt(0)} Z` : ''
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 58))))

  const distance = (e: GestureResponderEvent) => {
    const [a, b] = e.nativeEvent.touches
    return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)
  }

  function onGrant(e: GestureResponderEvent) {
    onTouchActive(true)
    moved.current = false
    startX.current = e.nativeEvent.locationX
    pinch.current = null
    setActive(indexAt(e.nativeEvent.locationX))
    return true // true = a natív görgető nem veheti át a mozdulatot
  }
  function onMove(e: GestureResponderEvent) {
    const touches = e.nativeEvent.touches
    if (touches.length >= 2) {
      moved.current = true
      const d = distance(e)
      if (!pinch.current) pinch.current = { start: d, done: false }
      else if (!pinch.current.done && d / pinch.current.start > 1.3) {
        pinch.current.done = true
        const mid = (touches[0].locationX + touches[1].locationX) / 2
        const i = indexAt(mid)
        if (points[i]?.zoomable) onZoomIn(i)
      } else if (!pinch.current.done && d / pinch.current.start < 0.75) {
        pinch.current.done = true
        onZoomOut()
      }
      return
    }
    if (pinch.current) return
    if (Math.abs(e.nativeEvent.locationX - startX.current) > 8) moved.current = true
    setActive(indexAt(e.nativeEvent.locationX))
  }
  function onRelease() {
    onTouchActive(false)
    const now = Date.now()
    if (pinch.current || moved.current) lastTap.current = 0
    else if (now - lastTap.current < 320) {
      lastTap.current = 0
      if (points[index]?.zoomable) onZoomIn(index)
    } else lastTap.current = now
    pinch.current = null
  }

  const p = points[index]
  const tipW = 200
  const tipLeft = p ? Math.max(0, Math.min(width - tipW, xAt(index) - tipW / 2)) : 0

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ gap: 8 }}
      accessibilityRole="image" accessibilityLabel={p ? `Bevétel grafikon, ${p.label}: ${huf(p.value)}` : 'Bevétel grafikon'}>
      {/* A kijelölt pont adatai, nagyítás gombbal */}
      <View style={{ height: 66 }}>
        {p && width > 0 && (
          <View style={{ position: 'absolute', left: tipLeft, width: tipW, alignItems: 'center', gap: 1 }}>
            <Text style={[s.small, { color: c.muted }]} numberOfLines={1}>{p.label}</Text>
            <Text style={{ color: c.text, fontFamily: f.semibold, fontSize: 20, lineHeight: 26 }} numberOfLines={1}>{huf(p.value)}</Text>
            <View style={[s.row, { gap: 10 }]}>
              <Text style={[s.small, { color: c.faint }]}>{p.count} vendég</Text>
              {p.zoomable && (
                <Pressable onPress={() => onZoomIn(index)} hitSlop={8} accessibilityLabel="Nagyítás erre"
                  style={({ pressed }) => [s.row, { gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: c.roseSoft }, pressed && { opacity: 0.6 }]}>
                  <ZoomIn size={12} color={c.rose} strokeWidth={2} />
                  <Text style={{ color: c.rose, fontSize: 11, fontFamily: f.medium }}>Részletek</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>

      <View style={{ height: H }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant as never}
        onResponderMove={onMove}
        onResponderRelease={onRelease}
        onResponderTerminate={() => { onTouchActive(false); pinch.current = null }}
        // Asztalon egérmozgásra is követ
        onPointerMove={(e) => { const x = (e.nativeEvent as unknown as { offsetX?: number }).offsetX; if (typeof x === 'number' && e.nativeEvent.pointerType === 'mouse') setActive(indexAt(x)) }}>
        {width > 0 && (
          <Svg width={width} height={H} pointerEvents="none">
            {ticks.map((t) => (
              <Line key={t} x1={PAD.left} x2={width - PAD.right} y1={yAt(t)} y2={yAt(t)} stroke={t === 0 ? 'rgba(215,162,170,0.28)' : c.line} strokeWidth={1} />
            ))}
            {n > 1 && <Path d={area} fill={c.rose} fillOpacity={0.1} />}
            {n > 1 && <Path d={line} stroke={c.rose} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />}
            {bubbles && points.map((pt, i) => pt.value > 0 && i !== index ? <Circle key={pt.key} cx={xAt(i)} cy={yAt(pt.value)} r={4} fill={c.rose} stroke={c.card} strokeWidth={2} /> : null)}
            {p && <Line x1={xAt(index)} x2={xAt(index)} y1={padTop} y2={yAt(0)} stroke={c.muted} strokeOpacity={0.5} strokeWidth={1} />}
            {p && <Circle cx={xAt(index)} cy={yAt(p.value)} r={6} fill={c.rose} stroke={c.card} strokeWidth={2} />}
          </Svg>
        )}

        {/* Lebegő buborékok a pontok fölött (kevés pontnál) */}
        {bubbles && width > 0 && points.map((pt, i) => pt.value > 0 ? (
          <View key={pt.key} pointerEvents="none" style={{
            position: 'absolute', left: Math.max(0, Math.min(width - 96, xAt(i) - 48)), width: 96, top: yAt(pt.value) - 36, alignItems: 'center',
          }}>
            <View style={{ backgroundColor: i === index ? c.rose : c.raised, borderColor: c.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, maxWidth: 96 }}>
              <Text numberOfLines={1} style={{ color: i === index ? c.bg : c.text, fontSize: 11, fontFamily: f.semibold, textAlign: 'center' }}>
                {pt.names?.length ? `${pt.names[0].split(' ').slice(-1)[0]}${pt.names.length > 1 ? ` +${pt.names.length - 1}` : ''}` : `${compact(pt.value)} Ft`}
              </Text>
            </View>
          </View>
        ) : null)}

        {/* Y tengely */}
        {ticks.map((t) => (
          <Text key={t} pointerEvents="none" style={[s.small, { position: 'absolute', left: 0, width: PAD.left - 8, textAlign: 'right', top: yAt(t) - 8, fontSize: 11, color: c.faint, fontVariant: ['tabular-nums'] }]}>
            {compact(t)}
          </Text>
        ))}
        {/* X tengely */}
        {width > 0 && points.map((pt, i) => (i % labelEvery === 0 || i === n - 1) && (n - 1 - i >= labelEvery || i === n - 1) ? (
          <Text key={pt.key} pointerEvents="none" numberOfLines={1} style={[s.small, { position: 'absolute', top: H - PAD.bottom + 8, left: xAt(i) - 30, width: 60, textAlign: 'center', fontSize: 11, color: i === index ? c.text : c.faint }]}>
            {pt.axis}
          </Text>
        ) : null)}
      </View>
    </View>
  )
}
