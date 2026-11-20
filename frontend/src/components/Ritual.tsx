import { useEffect, useRef } from 'react'
import { gsap, reducedMotion } from '../lib/motion'
import { Headline } from './Headline'

const steps = [
  { title: 'Válassz időpontot', text: 'Csak a valóban szabad idősávok látszanak, a kiválasztott szolgáltatás hosszához igazítva.' },
  { title: 'Kapsz visszaigazolást', text: 'E-mailben megkapod az időpontot és a saját linkedet, amin később megerősítheted vagy lemondhatod.' },
  { title: 'Emlékeztetünk', text: 'Egy nappal és két órával előtte jön egy üzenet. Ha nem tudsz jönni, egy kattintással szólsz.' },
  { title: 'Gyere és pihenj', text: 'Pontosan, kísérő nélkül érkezz. A következő pár óra rólad szól.' },
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
        <p className="eyebrow" data-reveal><span className="eyebrow-line" />Így működik</p>
        <Headline text={'Egyszerű, mint egy\n*jó rutin.*'} />
        <p className="section-sub" data-reveal>Nincs oda-vissza üzenetváltás: a foglalás percek alatt megvan, a többit az emlékeztetők intézik.</p>
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
