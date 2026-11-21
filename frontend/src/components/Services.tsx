import { useState } from 'react'
import { catalog, durationLabel, forint, minPrice } from '../lib/catalog'
import { openBooking } from '../lib/bookingModal'
import { Headline } from './Headline'
import { Photo } from './Photo'

const previews = { gel: 'burgundy-french', epites: 'french-gems', toltes: 'ombre-pearls' } as const

export function Services() {
  const [active, setActive] = useState(0)

  return (
    <section className="services" id="szolgaltatasok">
      <div className="section-head">
        <p className="eyebrow" data-reveal><span className="eyebrow-line" />Szolgáltatások</p>
        <Headline text={'Amire *vágysz,*\nelkészítem.'} />
      </div>
      <div className="services-body">
        <ol className="service-list">
          {catalog.categories.map((category, index) => (
            <li key={category.id} className={index === active ? 'is-active' : ''} data-reveal onPointerEnter={() => setActive(index)} onFocus={() => setActive(index)}>
              <span className="service-no">0{index + 1}</span>
              <div className="service-main">
                <h3>{category.name}</h3>
                <p>{category.blurb}</p>
                <Photo className="service-thumb" id={previews[category.id as keyof typeof previews]} sizes="120px" />
                <p className="service-meta"><span>{forint(minPrice(category))}-tól</span><span>{durationLabel(category.durationMinutes)}</span></p>
              </div>
              <button type="button" className="service-go" onClick={() => openBooking(category.id)} aria-label={`Időpont: ${category.name}`}><span>Időpont</span><i aria-hidden="true">→</i></button>
            </li>
          ))}
        </ol>
        <div className="service-preview" aria-hidden="true">
          {catalog.categories.map((category, index) => (
            <div key={category.id} className={`service-preview-item${index === active ? ' is-active' : ''}`}>
              <Photo id={previews[category.id as keyof typeof previews]} sizes="(min-width: 900px) 30vw, 0px" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
