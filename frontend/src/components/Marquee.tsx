import { useEffect, useRef } from 'react'
import { gsap, ScrollTrigger, reducedMotion } from '../lib/motion'

const words = ['Géllakk', 'Műköröm építés', 'Töltés', 'Nail art', 'Strasszkő', 'Króm por', 'Babyboomer', 'Francia']

export function Marquee() {
  const track = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = track.current
    if (!el || reducedMotion()) return
    const ctx = gsap.context(() => {
      const tween = gsap.to(el, { xPercent: -50, duration: 38, ease: 'none', repeat: -1 })
      // Görgetésre felgyorsul, utána lassan visszaáll
      ScrollTrigger.create({
        start: 0, end: 'max',
        onUpdate: (self) => {
          const boost = gsap.utils.clamp(1, 5, 1 + Math.abs(self.getVelocity()) / 350)
          tween.timeScale(boost)
          gsap.to(tween, { timeScale: 1, duration: 0.9, overwrite: true })
        },
      })
    })
    return () => ctx.revert()
  }, [])

  const text = words.map((word) => `${word}  ✦  `).join('')
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track" ref={track}><span>{text}</span><span>{text}</span><span>{text}</span><span>{text}</span></div>
    </div>
  )
}
