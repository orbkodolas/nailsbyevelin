import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)
// Mobilon a címsor be-/kicsúszása ne indítson teljes újraszámolást görgetés közben (ez okozta a legtöbb akadást)
ScrollTrigger.config({ ignoreMobileResize: true })
// A GSAP a kijelző frissítéséhez igazodik (60/90/120 Hz): nincs fps-plafon, a lag-simítás ki van kapcsolva
gsap.ticker.lagSmoothing(0)

// GPU-n (kompozitorban) futó görbék a WAAPI-animációkhoz
export const EASE_EXPO_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'
export const EASE_POWER3_OUT = 'cubic-bezier(0.215, 0.61, 0.355, 1)'

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
export const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches

let lenis: Lenis | null = null
export const getLenis = () => lenis

// Lenis: egér/touchpad görgetés simítása a GSAP tickerén (egy rAF-ciklus, kijelző-frekvencián).
// Érintésen a natív görgetés marad: azt a böngésző a kompozitorban, a kijelző teljes frekvenciáján futtatja,
// ezt JS-ből szinkronizálni csak rontana rajta.
export function initSmoothScroll() {
  // A böngésző ne állítsa vissza a régi görgetési pozíciót frissítéskor (a Lenis-szel ütközve ez okozott rántást)
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  if (reducedMotion()) return () => {}
  const instance = new Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true, syncTouch: false, autoRaf: false })
  lenis = instance
  instance.on('scroll', ScrollTrigger.update)
  const tick = (time: number) => instance.raf(time * 1000)
  gsap.ticker.add(tick)
  return () => { gsap.ticker.remove(tick); instance.destroy(); lenis = null }
}

// Horgonyhoz görgetés. A tempó a távolsághoz igazodik (rövid úton gyors, hosszún max. ~1,4 s), így nincs
// „nagy erejű” száguldás; `immediate` esetén azonnal ugrik (pl. betöltéskori horgony-link).
export function scrollToTarget(target: string | number, offset = -72, immediate = false) {
  const element = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : null
  const top = typeof target === 'number' ? target : element ? element.getBoundingClientRect().top + window.scrollY + offset : 0
  const instant = immediate || reducedMotion()
  if (lenis) {
    const distance = Math.abs(top - window.scrollY)
    const duration = Math.min(1.4, 0.6 + distance / 4000)
    lenis.scrollTo(Math.max(0, top), { immediate: instant, force: true, duration, easing: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) })
  } else window.scrollTo({ top: Math.max(0, top), behavior: instant ? 'auto' : 'smooth' })
}

export { gsap, ScrollTrigger }
