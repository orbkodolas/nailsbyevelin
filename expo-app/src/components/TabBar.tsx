import { useEffect, useRef, useState } from 'react'
import { Animated, Platform, Pressable, Text, View } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg'
import { c, f } from '../theme'
import type { IconType } from '../ui'

type Tab = { key: string; label: string; icon: IconType }

const native = Platform.OS !== 'web'
const H = 66 // sáv magassága
const D = 34 // kivágás mélysége
const ORB = 54 // lebegő kör átmérője
const PAD = 16 // hely a kör árnyékának / fényének
const BOX = ORB + PAD * 2
const ORB_TOP = 1 - BOX / 2 // a kör közepe a sáv felső élén

/**
 * Alsó menü lebegő aktív füllel: a kör és a sáv kivágása együtt csúszik.
 * Mindkettő ugyanazt a rugós értéket követi (natív animáció), ami mindig a pillanatnyi
 * helyzetből és sebességből indul, így gyors nyomkodásnál sem ugrik.
 */
export function TabBar({ tabs, active, onSelect }: { tabs: readonly Tab[]; active: string; onSelect: (key: string) => void }) {
  const [width, setWidth] = useState(0)
  const index = Math.max(0, tabs.findIndex((t) => t.key === active))
  const x = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(1)).current
  const iconIn = useRef(new Animated.Value(1)).current
  const shown = useRef(tabs.map((t) => new Animated.Value(t.key === active ? 0 : 1))).current
  const placed = useRef(false)

  useEffect(() => {
    if (!width) return
    const to = (width / tabs.length) * (index + 0.5)
    shown.forEach((v, i) => Animated.timing(v, { toValue: i === index ? 0 : 1, duration: 200, useNativeDriver: native }).start())
    if (!placed.current) { placed.current = true; x.setValue(to); return }
    Animated.spring(x, { toValue: to, damping: 22, stiffness: 260, mass: 1, useNativeDriver: native }).start()
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 90, useNativeDriver: native }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: native }),
    ]).start()
    iconIn.setValue(0)
    Animated.timing(iconIn, { toValue: 1, duration: 180, useNativeDriver: native }).start()
  }, [index, width])

  const W = width || 1
  // A sáv kétszer olyan széles, mint a képernyő; a kivágás a közepén van, és a sávot toljuk el alatta
  const edge = `M0,0.5 H${W - 50} C${W - 36},0.5 ${W - 40},${D} ${W},${D} C${W + 40},${D} ${W + 36},0.5 ${W + 50},0.5 H${2 * W}`
  const ActiveIcon = tabs[index].icon

  return (
    <View style={{ height: H }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' }} pointerEvents="none">
            <Animated.View style={{ width: 2 * W, height: H, transform: [{ translateX: Animated.subtract(x, W) }] }}>
              <Svg width={2 * W} height={H}>
                <Path d={`${edge} V${H} H0 Z`} fill={c.card} />
                <Path d={edge} fill="none" stroke={c.line} strokeWidth={1} />
              </Svg>
            </Animated.View>
          </View>
          <Animated.View pointerEvents="none"
            style={{ position: 'absolute', top: ORB_TOP, left: 0, width: BOX, height: BOX, zIndex: 2,
              transform: [{ translateX: Animated.subtract(x, BOX / 2) }, { scale }] }}>
            <Svg width={BOX} height={BOX}>
              <Defs>
                <RadialGradient id="tbFill" cx="35%" cy="30%" r="75%">
                  <Stop offset="0" stopColor="#ecc3c9" />
                  <Stop offset="0.45" stopColor={c.rose} />
                  <Stop offset="1" stopColor={c.roseDeep} />
                </RadialGradient>
                <LinearGradient id="tbShine" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#fff" stopOpacity={0.45} />
                  <Stop offset="0.4" stopColor="#fff" stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Circle cx={BOX / 2} cy={BOX / 2} r={ORB / 2} fill="url(#tbFill)" />
              <Circle cx={BOX / 2} cy={BOX / 2} r={ORB / 2 - 0.5} fill="none" stroke="url(#tbShine)" strokeWidth={1} />
            </Svg>
            <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: BOX, height: BOX, alignItems: 'center', justifyContent: 'center', opacity: iconIn }}>
              <ActiveIcon size={22} color="#1a0f12" strokeWidth={2} />
            </Animated.View>
          </Animated.View>
        </>
      )}
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {tabs.map((t, i) => {
          const on = i === index
          return (
            <Pressable key={t.key} onPress={() => onSelect(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label}
              style={{ flex: 1, alignItems: 'center', paddingTop: 12, paddingBottom: 12 }}>
              <Animated.View style={{ opacity: shown[i], transform: [{ translateY: shown[i].interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] }}>
                <t.icon size={21} color={c.muted} strokeWidth={1.6} />
              </Animated.View>
              <Text style={{ marginTop: 'auto', color: on ? c.rose : c.muted, fontSize: 12, lineHeight: 16, fontFamily: on ? f.semibold : f.sans }}>{t.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
