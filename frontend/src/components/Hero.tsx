import { useEffect, useRef } from 'react'
import { gsap, reducedMotion } from '../lib/motion'
import { Headline } from './Headline'
import { Photo } from './Photo'

const ringText = 'Nails by Evelin · Műköröm · Géllakk ·'

export function Hero() {
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const scope = root.current
    if (!scope || reducedMotion()) return
    const ctx = gsap.context(() => {
      // Teljes belépés ≤1.2 s: címsor-szavak maszkból, kép finom felfedése, a többi rövid fade
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
      tl.from('.hero .wi', { yPercent: 100, duration: 0.8, stagger: 0.07 }, 0.1)
        .from('.arch', { clipPath: 'inset(8% 8% 8% 8% round 28px)', duration: 1.1 }, 0.1)
        .from('.arch img', { scale: 1.08, duration: 1.1, ease: 'power3.out' }, 0.1)
        .from('[data-hero="fade"]', { y: 16, autoAlpha: 0, duration: 0.7, stagger: 0.05, ease: 'power3.out' }, 0.3)
        .from('.arch-ring', { autoAlpha: 0, duration: 0.6, ease: 'power2.out' }, 0.5)
        .from('.badge', { autoAlpha: 0, y: 10, duration: 0.6, ease: 'power3.out' }, 0.6)
      gsap.to('.arch img', { yPercent: 4, ease: 'none', scrollTrigger: { trigger: scope, start: 'top top', end: 'bottom top', scrub: true } })
    }, scope)
    return () => ctx.revert()
  }, [])

  return (
    <section className="hero" id="kezdo" ref={root}>
      <div className="hero-inner">
        <div className="hero-copy">
          <p className="eyebrow" data-hero="fade"><span className="eyebrow-line" />Műköröm · Géllakk · Töltés</p>
          <Headline as="h1" reveal={false} className="hero-title" text={'Idő a\n*szépségre.*'} />
          <p className="hero-lead" data-hero="fade">Műköröm és géllakk Evelintől. Precízen, kapkodás nélkül: minden szett legalább két óra teljes figyelem.</p>
          <div className="hero-actions" data-hero="fade">
            <a className="btn btn-primary" href="#idopont"><span>Időpontot foglalok</span></a>
            <a className="btn-link" href="#munkak">Munkáim</a>
          </div>
        </div>

        <div className="hero-visual">
          <div className="arch-ring" aria-hidden="true" />
          <div className="arch"><Photo id="pink-nude" eager sizes="(min-width: 900px) 34vw, 80vw" /></div>
          <div className="badge" aria-hidden="true">
            <svg className="badge-ring" viewBox="0 0 120 120">
              <defs><path id="ring-path" d="M60,60 m-48,0 a48,48 0 1,1 96,0 a48,48 0 1,1 -96,0" /></defs>
              <text><textPath href="#ring-path" startOffset="0" textLength="298" lengthAdjust="spacing">{ringText}</textPath></text>
            </svg>
            <svg className="badge-heart" viewBox="0 0 24 24"><path d="M12 20.5C6 16.6 3 13 3 9.4 3 6.8 5 5 7.3 5c1.9 0 3.6 1.1 4.7 2.9C13.1 6.1 14.8 5 16.7 5 19 5 21 6.8 21 9.4c0 3.6-3 7.2-9 11.1z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
          </div>
        </div>
      </div>

      <ul className="hero-facts" data-hero="fade">
        <li><b>2 óra+</b><span>teljes figyelem szettenként</span></li>
        <li><b>Online</b><span>foglalás, emlékeztetővel</span></li>
        <li><b>Egyedi</b><span>forma, szín, díszítés</span></li>
      </ul>
      <a className="scroll-cue" href="#rolam" aria-label="Lejjebb az oldalon"><span>Görgess</span><i /></a>
    </section>
  )
}
