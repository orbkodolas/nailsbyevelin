import { Headline } from './Headline'
import { Photo } from './Photo'

export function About() {
  return (
    <section className="about section-light" id="rolam">
      <div className="about-media">
        <div className="frame frame-main" data-clip data-parallax="0.1"><Photo id="red-glitter" sizes="(min-width: 900px) 34vw, 70vw" /></div>
        <div className="frame frame-side" data-clip data-delay="0.2" data-parallax="0.12"><Photo id="mocha-crystals" sizes="(min-width: 900px) 18vw, 40vw" /></div>
      </div>
      <div className="about-copy">
        <Headline text={'Precizitás,\nodafigyelés, *idő.*'} />
        <p data-reveal>Minden körmöt úgy készítek el, mintha a sajátom lenne: lassan, pontosan.</p>
        <p data-reveal>Kedves és rugalmas vagyok, de az én időm is ugyanannyit ér, mint a tiéd.</p>
      </div>
    </section>
  )
}
