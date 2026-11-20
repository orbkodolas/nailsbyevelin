import { useEffect, type RefObject } from 'react'
import { gsap, ScrollTrigger, reducedMotion } from './motion'

// Visszafogott, egyszeri görgetés-animációk data-attribútumokkal:
//  [data-words]   – címsor szavai maszkból, soron belül lépcsőzve csúsznak fel
//  [data-reveal]  – rövid, kis elmozdulású felúszás (batch-elt stagger)
//  [data-clip]    – kép alulról felfedése, közben finom beúszás (data-delay másodpercben)
//  [data-parallax="0.1"] – csak képen, kis mértékű görgetés-eltolás
export function useScrollEffects(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current
    if (!root || reducedMotion()) return
    const ctx = gsap.context(() => {
      const words = gsap.utils.toArray<HTMLElement>('[data-words] .wi')
      if (words.length) {
        gsap.set(words, { yPercent: 100 })
        ScrollTrigger.batch(words, {
          start: 'top 90%',
          once: true,
          interval: 0.05,
          onEnter: (batch) => gsap.to(batch, { yPercent: 0, duration: 0.8, ease: 'expo.out', stagger: 0.04, overwrite: true }),
        })
      }

      const reveals = gsap.utils.toArray<HTMLElement>('[data-reveal]')
      if (reveals.length) {
        gsap.set(reveals, { y: 20, autoAlpha: 0 })
        ScrollTrigger.batch(reveals, {
          start: 'top 92%',
          once: true,
          interval: 0.1,
          batchMax: 6,
          onEnter: (batch) => gsap.to(batch, { y: 0, autoAlpha: 1, duration: 0.7, ease: 'power3.out', stagger: 0.08, overwrite: true }),
        })
      }

      gsap.utils.toArray<HTMLElement>('[data-clip]').forEach((el) => {
        const delay = Number(el.dataset.delay || 0)
        gsap.from(el, { clipPath: 'inset(100% 0% 0% 0%)', duration: 1.1, ease: 'expo.out', delay, scrollTrigger: { trigger: el, start: 'top 90%', once: true } })
        const img = el.querySelector('img')
        if (img) gsap.from(img, { scale: 1.08, duration: 1.3, ease: 'power3.out', delay, scrollTrigger: { trigger: el, start: 'top 90%', once: true } })
      })

      gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach((el) => {
        const img = el.querySelector('img')
        if (!img) return
        const range = Math.min(Number(el.dataset.parallax || 0.1) * 100, 8) / 2
        gsap.fromTo(img, { yPercent: -range }, { yPercent: range, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } })
      })
    }, root)
    return () => ctx.revert()
  }, [ref])
}
