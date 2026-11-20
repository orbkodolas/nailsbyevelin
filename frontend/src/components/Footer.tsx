import { site } from '../lib/site'

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
        {(site.phone || site.address || site.instagramUrl) && <ul className="footer-contact">
          {site.phone && <li><a href={`tel:${site.phone.replace(/\s/g, '')}`}>{site.phone}</a></li>}
          {site.address && <li>{site.address}</li>}
          {site.instagramUrl && <li><a href={site.instagramUrl} rel="noopener noreferrer" target="_blank">Instagram</a></li>}
        </ul>}
        {site.facebookUrl && (
          <div className="footer-social">
            <a href={site.facebookUrl} target="_blank" rel="noopener noreferrer" aria-label="Nails by Evelin a Facebookon">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07z" /></svg>
            </a>
          </div>
        )}
      </div>
      <div className="footer-bottom">
        <span>© {YEAR} Nails by Evelin</span>
        <span>A foglaláshoz megadott adataidat kizárólag a foglalás intézéséhez használom.</span>
      </div>
    </footer>
  )
}
