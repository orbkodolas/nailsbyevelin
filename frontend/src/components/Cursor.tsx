import { useEffect, useRef, useState } from 'react'
import { finePointer, gsap } from '../lib/motion'

// Egyedi kurzor csak egérrel; érintőeszközön nem jelenik meg
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const [enabled] = useState(() => finePointer())

  useEffect(() => {
    if (!finePointer() || !dot.current || !ring.current) return
    const root = document.documentElement
    root.classList.add('has-cursor')
    const moveDotX = gsap.quickTo(dot.current, 'x', { duration: 0.12, ease: 'power3' })
    const moveDotY = gsap.quickTo(dot.current, 'y', { duration: 0.12, ease: 'power3' })
    const moveRingX = gsap.quickTo(ring.current, 'x', { duration: 0.5, ease: 'power3' })
    const moveRingY = gsap.quickTo(ring.current, 'y', { duration: 0.5, ease: 'power3' })
    const move = (event: PointerEvent) => {
      root.classList.add('cursor-on')
      moveDotX(event.clientX); moveDotY(event.clientY); moveRingX(event.clientX); moveRingY(event.clientY)
    }
    const over = (event: Event) => {
      const target = event.target as Element | null
      root.classList.toggle('cursor-active', Boolean(target?.closest('a, button, [data-cursor], label, summary')))
    }
    const leave = () => root.classList.remove('cursor-on')
    window.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerover', over, { passive: true })
    document.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('pointermove', move); document.removeEventListener('pointerover', over); document.removeEventListener('pointerleave', leave)
      root.classList.remove('has-cursor', 'cursor-on', 'cursor-active')
    }
  }, [enabled])

  if (!enabled) return null
  return (<><div ref={ring} className="cursor-ring" aria-hidden="true" /><div ref={dot} className="cursor-dot" aria-hidden="true" /></>)
}
