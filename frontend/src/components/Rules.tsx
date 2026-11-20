import { catalog } from '../lib/catalog'
import { Headline } from './Headline'

export function Rules() {
  return (
    <section className="rules" id="hazirend">
      <div className="rules-head">
        <p className="eyebrow" data-reveal><span className="eyebrow-line" />Házirend</p>
        <Headline text={'A tisztelet\n*kölcsönös.*'} />
      </div>
      <ol className="rules-list">
        {catalog.rules.map((rule, index) => (
          <li key={rule.id} data-reveal>
            <span className="rule-no">{index + 1}</span>
            <h3>{rule.title}</h3>
            <p>{rule.text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
