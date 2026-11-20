import { useEffect, useRef } from 'react'
import { gsap, reducedMotion } from '../lib/motion'
import { Headline } from './Headline'

const steps = [
  { title: 'Válassz időpontot', text: 'Csak a szabad idősávok látszanak, a szolgáltatás hosszához igazítva.' },
  { title: 'Kapsz visszaigazolást', text: 'E-mailben megkapod az időpontot és a kezelőlinket.' },
  { title: 'Emlékeztetünk', text: 'Egy nappal és két órával előtte üzenetet küldünk.' },
]

export function Ritual() {
  const list = useRef<HTMLOListElement>(null)
  const line = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!list.current || !line.current || reducedMotion()) return
    const ctx = gsap.context(() => {
      gsap.fromTo(line.current, { scaleY: 0 }, { scaleY: 1, ease: 'none', transformOrigin: 'top', scrollTrigger: { trigger: list.current, start: 'top 70%', end: 'bottom 70%', scrub: true } })
    }, list)
    return () => ctx.revert()
  }, [])

  return (
    <section className="ritual" id="folyamat">
      <div className="ritual-intro">
        <p className="eyebrow" data-reveal><span className="eyebrow-line" />Foglalás</p>
        <Headline text={'Három lépés\n*az időpontig.*'} />
      </div>
      <ol className="ritual-steps" ref={list}>
        <span className="ritual-line" ref={line} aria-hidden="true" />
        {steps.map((step, index) => (
          <li key={step.title} data-reveal>
            <span className="ritual-no">0{index + 1}</span>
            <div><h3>{step.title}</h3><p>{step.text}</p></div>
          </li>
        ))}
      </ol>
    </section>
  )
}
