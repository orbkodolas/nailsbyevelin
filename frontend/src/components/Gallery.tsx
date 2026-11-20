import { useEffect, useRef } from 'react'
import { gsap, reducedMotion } from '../lib/motion'
import { photos } from '../lib/images'
import { Headline } from './Headline'
import { Photo } from './Photo'

const order = ['pink-glitter', 'french-flower', 'burgundy-dots', 'red-glitter', 'french-gems', 'leopard-rust', 'pink-nude', 'mocha-crystals', 'ombre-pearls', 'burgundy-french', 'chanel-black'] as const

export function Gallery() {
  const root = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const section = root.current
    const rail = track.current
    if (!section || !rail || reducedMotion()) return
    const mm = gsap.matchMedia()
    // Asztali nézet: a szekció rögzül, a sáv oldalra halad. Mobilon natív, lapozós sáv.
    mm.add('(min-width: 900px)', () => {
      const distance = () => Math.max(0, rail.scrollWidth - window.innerWidth + 120)
      gsap.to(rail, {
        x: () => -distance(), ease: 'none',
        scrollTrigger: {
          trigger: section, start: 'top top', end: () => `+=${distance()}`, pin: true, scrub: 0.8, invalidateOnRefresh: true,
          onUpdate: (self) => { if (bar.current) bar.current.style.transform = `scaleX(${self.progress})` },
        },
      })
    })
    return () => mm.revert()
  }, [])

  return (
    <section className="gallery" id="munkak" ref={root}>
      <div className="gallery-head">
        <div>
          <p className="eyebrow" data-reveal><span className="eyebrow-line" />Munkáim</p>
          <Headline text={'Kézzel *készült,*\nrészletekig.'} />
        </div>
        <p className="gallery-hint">Görgess tovább <i aria-hidden="true">→</i></p>
      </div>
      <div className="gallery-rail" tabIndex={0} aria-label="Munkáim galéria">
        <div className="gallery-track" ref={track}>
          {order.map((id, index) => (
            <figure className="gallery-item" key={id}>
              <div className="gallery-frame"><Photo id={id} sizes="(min-width: 900px) 24vw, 70vw" /></div>
              <figcaption><span>{String(index + 1).padStart(2, '0')}</span>{photos[id].caption}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="gallery-progress" aria-hidden="true"><span ref={bar} /></div>
    </section>
  )
}
