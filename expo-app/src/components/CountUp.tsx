import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Text, type TextProps } from 'react-native'

/**
 * Felszámoló szám (CountUp.js mintájára: easeOutExpo, gyors indulás, lágy megérkezés).
 * Csak az app hidegindítása utáni első megjelenéskor animál; utána (frissítés, fülváltás) azonnal a végértéket mutatja.
 * tabular-nums: a számjegyek egyforma szélesek, így a szöveg nem „ugrál” számolás közben.
 */
let introPlayed = false
let reduceMotion = false
AccessibilityInfo.isReduceMotionEnabled?.().then((on) => { reduceMotion = on }).catch(() => {})

/**
 * A képernyő egyszer, mountkor kérdezze le (useState(countUpPending)), hogy az `animate` prop végig állandó maradjon;
 * az első valódi adat megjelenése után hívja a markCountUpPlayed-et.
 */
export const countUpPending = () => !introPlayed
export const markCountUpPlayed = () => { introPlayed = true }

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))

export function CountUp({ value, format, animate, duration = 1100, delay = 0, ...text }: TextProps & {
  value: number; format: (n: number) => string; animate: boolean; duration?: number; delay?: number
}) {
  const [shown, setShown] = useState(animate && !reduceMotion ? 0 : value)
  const started = useRef(false)

  useEffect(() => {
    // Egyszer fut le, az első nem nulla értékre; minden későbbi érték azonnal látszik
    if (started.current || !animate || reduceMotion || value === 0) { setShown(value); return }
    started.current = true
    let frame = 0
    const t0 = Date.now() + delay
    const tick = () => {
      const t = (Date.now() - t0) / duration
      if (t >= 0) setShown(Math.round(value * easeOutExpo(t)))
      if (t < 1) frame = requestAnimationFrame(tick)
      else setShown(value)
    }
    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); setShown(value) }
  }, [animate, value, duration, delay])

  return <Text {...text} style={[{ fontVariant: ['tabular-nums'] }, text.style]}>{format(shown)}</Text>
}
