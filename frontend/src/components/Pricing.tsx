import { catalog, durationLabel, forint } from '../lib/catalog'
import { Headline } from './Headline'

function Ledger({ rows }: { rows: { name: string; price: string }[] }) {
  return (
    <ul className="ledger">
      {rows.map((row) => (
        <li key={row.name}><span className="ledger-name">{row.name}</span><i className="ledger-dots" aria-hidden="true" /><span className="ledger-price">{row.price}</span></li>
      ))}
    </ul>
  )
}

export function Pricing() {
  return (
    <section className="pricing section-light" id="arlista">
      <div className="section-head">
        <p className="eyebrow" data-reveal><span className="eyebrow-line" />Árlista</p>
        <Headline text={'Átlátható *árak.*'} />
        <p className="section-sub" data-reveal>Az árlista {catalog.pricesValidFromText} érvényes. Az extrák az alapár mellé jönnek.</p>
      </div>
      <div className="pricing-main">
        {catalog.categories.map((category) => (
          <div className="price-block" key={category.id} data-reveal>
            <h3>{category.name}</h3>
            <p className="price-time">{durationLabel(category.durationMinutes)}</p>
            <Ledger rows={category.items.map((item) => ({ name: item.name, price: forint(item.priceHuf) }))} />
          </div>
        ))}
      </div>
      <div className="pricing-extra">
        <div className="price-block" data-reveal><h3>Díszítések és extrák</h3><Ledger rows={catalog.extras} /></div>
        <div className="price-block" data-reveal><h3>Egyéb szolgáltatások</h3><Ledger rows={catalog.otherServices} /></div>
      </div>
      <div className="pricing-cta" data-reveal>
        <a className="btn btn-dark" href="#idopont"><span>Időpontot foglalok</span></a>
      </div>
    </section>
  )
}
