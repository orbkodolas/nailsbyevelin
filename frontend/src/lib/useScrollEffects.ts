import { useEffect, type RefObject } from 'react'
import { gsap, reducedMotion } from './motion'

// Közös görgetés-animációk data-attribútumokkal:
//  [data-words]   – címsor szavai maszkból csúsznak be
//  [data-reveal]  – lágy felcsúszás (data-delay másodpercben)
//  [data-clip]    – kép felfedés lentről, közben finom nagyítás
//  [data-parallax="0.12"] – kép eltolódás görgetésre
export function useScrollEffects(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current
    if (!root || reducedMotion()) return
    const ctx = gsap.context(() => {
      const trigger = (el: Element, start = 'top 88%') => ({ trigger: el, start, once: true })

      gsap.utils.toArray<HTMLElement>('[data-words]').forEach((el) => {
        gsap.from(el.querySelectorAll('.wi'), { yPercent: 115, duration: 1.1, ease: 'power4.out', stagger: 0.06, scrollTrigger: trigger(el) })
      })
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
        gsap.from(el, { y: 36, autoAlpha: 0, duration: 1, ease: 'power3.out', delay: Number(el.dataset.delay || 0), scrollTrigger: trigger(el, 'top 92%') })
      })
      gsap.utils.toArray<HTMLElement>('[data-clip]').forEach((el) => {
        gsap.from(el, { clipPath: 'inset(100% 0% 0% 0%)', duration: 1.4, ease: 'power4.inOut', delay: Number(el.dataset.delay || 0), scrollTrigger: trigger(el, 'top 90%') })
        const img = el.querySelector('img')
        if (img) gsap.from(img, { scale: 1.3, duration: 1.8, ease: 'power3.out', delay: Number(el.dataset.delay || 0), scrollTrigger: trigger(el, 'top 90%') })
      })
      gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach((el) => {
        const amount = Number(el.dataset.parallax || 0.1) * 100
        const target = el.querySelector('img') ?? el
        gsap.fromTo(target, { yPercent: -amount / 2 }, { yPercent: amount / 2, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } })
      })
    }, root)
    return () => ctx.revert()
  }, [ref])
}
