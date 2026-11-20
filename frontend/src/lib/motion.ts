import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
export const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches

let lenis: Lenis | null = null
export const getLenis = () => lenis

// Gyors, érzékeny görgetés (csak mutatóeszközön; érintésen natív marad) + ScrollTrigger szinkron
export function initSmoothScroll() {
  if (reducedMotion()) return () => {}
  const instance = new Lenis({ lerp: 0.12, wheelMultiplier: 1 })
  lenis = instance
  instance.on('scroll', ScrollTrigger.update)
  const tick = (time: number) => instance.raf(time * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)
  return () => { gsap.ticker.remove(tick); instance.destroy(); lenis = null }
}

export function scrollToTarget(target: string | number, offset = -72) {
  const element = typeof target === 'string' ? document.querySelector(target) : null
  const reduced = reducedMotion()
  if (lenis) lenis.scrollTo(typeof target === 'string' ? (element as HTMLElement) ?? 0 : target, { offset, duration: reduced ? 0.01 : 1, easing: (t: number) => 1 - Math.pow(1 - t, 4) })
  else if (element) element.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })
}

export { gsap, ScrollTrigger }
