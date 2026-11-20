import { site } from '../lib/site'
import { Sparkle } from './Sparkle'

const YEAR = new Date().getFullYear()

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <a className="footer-word" href="#kezdo" aria-label="Vissza az oldal tetejére">Nails <em>by</em> Evelin</a>
        <nav aria-label="Lábléc navigáció">
          <a href="#szolgaltatasok">Szolgáltatások</a><a href="#munkak">Munkáim</a><a href="#arlista">Árlista</a>
          <a href="#hazirend">Házirend</a><a href="#utalvany">Utalvány</a><a href="#idopont">Időpontfoglalás</a>
        </nav>
        <ul className="footer-contact">
          {site.phone && <li><a href={`tel:${site.phone.replace(/\s/g, '')}`}>{site.phone}</a></li>}
          {site.address && <li>{site.address}</li>}
          {site.facebookUrl && <li><a href={site.facebookUrl} rel="noopener noreferrer" target="_blank">Facebook</a></li>}
          {site.instagramUrl && <li><a href={site.instagramUrl} rel="noopener noreferrer" target="_blank">Instagram</a></li>}
        </ul>
      </div>
      <div className="footer-bottom">
        <span><Sparkle /> © {YEAR} Nails by Evelin</span>
        <span>Az időpontfoglaláshoz megadott adataidat (név, telefon, e-mail) kizárólag a foglalás intézéséhez használom.</span>
        <a href="#/admin" className="footer-admin">Admin</a>
      </div>
    </footer>
  )
}
