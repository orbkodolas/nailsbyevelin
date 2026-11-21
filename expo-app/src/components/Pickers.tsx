import { useEffect, useRef } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Minus, Plus } from 'lucide-react-native'
import { c, f, s } from '../theme'
import type { IconType } from '../ui'

/** Szegmentált választó (pl. Egész nap / Időszak / Több nap) */
export function Segmented<T extends string>({ options, value, onChange }: { options: { key: T; label: string; icon?: IconType }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.line, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const on = o.key === value
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={({ pressed }) => [{ flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 6 },
              { backgroundColor: on ? c.roseSoft : pressed ? c.raised : 'transparent' }]}>
            {o.icon && <o.icon size={15} color={on ? c.rose : c.muted} strokeWidth={on ? 2 : 1.6} />}
            <Text numberOfLines={1} style={{ color: on ? c.rose : c.muted, fontSize: 13, fontFamily: on ? f.semibold : f.medium }}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** Kerek −/+ gomb; nyomva tartva ismétel */
function StepButton({ icon: Icon, onStep, disabled, label }: { icon: IconType; onStep: () => void; disabled?: boolean; label: string }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const step = useRef(onStep)
  step.current = onStep
  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null } }
  useEffect(() => stop, [])
  useEffect(() => { if (disabled) stop() }, [disabled])
  return (
    <Pressable accessibilityLabel={label} disabled={disabled} hitSlop={6}
      onPress={() => step.current()}
      onLongPress={() => { stop(); timer.current = setInterval(() => step.current(), 110) }}
      onPressOut={stop}
      style={({ pressed }) => [{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: c.raised, borderWidth: 1, borderColor: c.line },
        (pressed && !disabled) && { backgroundColor: c.berry }, disabled && { opacity: 0.35 }]}>
      <Icon size={17} color={c.text} strokeWidth={1.8} />
    </Pressable>
  )
}

/** Érték léptetése −/+ gombokkal: balra a címke (és megjegyzés), jobbra a gombok között az érték */
export function Stepper({ label, value, hint, onMinus, onPlus, minusDisabled, plusDisabled }: {
  label: string; value: string; hint?: string; onMinus?: () => void; onPlus?: () => void; minusDisabled?: boolean; plusDisabled?: boolean
}) {
  const fixed = !onMinus && !onPlus
  return (
    <View style={[s.card, { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, gap: 10 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.eyebrow}>{label}</Text>
        {!!hint && <Text style={s.small} numberOfLines={1}>{hint}</Text>}
      </View>
      {fixed ? <View style={{ width: 38 }} /> : <StepButton icon={Minus} label={`${label} csökkentése`} onStep={onMinus!} disabled={minusDisabled} />}
      <Text style={{ minWidth: 92, textAlign: 'center', color: c.text, fontSize: 22, fontFamily: f.serif }} numberOfLines={1}>{value}</Text>
      {fixed ? <View style={{ width: 38 }} /> : <StepButton icon={Plus} label={`${label} növelése`} onStep={onPlus!} disabled={plusDisabled} />}
    </View>
  )
}

/** Gyorsválasztó címkék (pl. 3 nap / 1 hét / 2 hét) */
export function Chips<T extends string | number>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <View style={[s.row, { gap: 8 }]}>
      {options.map((o) => {
        const on = o.key === value
        return (
          <Pressable key={String(o.key)} onPress={() => onChange(o.key)}
            style={({ pressed }) => [{ minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, justifyContent: 'center' },
              { borderColor: on ? c.rose : c.line, backgroundColor: on ? c.roseSoft : pressed ? c.raised : 'transparent' }]}>
            <Text style={{ color: on ? c.rose : c.text, fontSize: 13, fontFamily: f.medium }}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}
