import { useEffect, useState } from 'react'
import { getLenis } from '../lib/motion'

const links = [
  ['#szolgaltatasok', 'Szolgáltatások'],
  ['#munkak', 'Munkáim'],
  ['#arlista', 'Árlista'],
  ['#hazirend', 'Házirend'],
  ['#utalvany', 'Utalvány'],
]

export function Header() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      setScrolled(y > 40)
      setHidden(y > last && y > 360)
      last = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    getLenis()?.stop()
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => { getLenis()?.start(); document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <header className={`site-header${scrolled ? ' is-scrolled' : ''}${hidden && !open ? ' is-hidden' : ''}${open ? ' is-open' : ''}`}>
      <a className="brand" href="#kezdo" aria-label="Nails by Evelin – főoldal" onClick={() => setOpen(false)}>
        <img src="/images/logo-sm.webp" width="44" height="44" alt="" />
        <span className="brand-name">Nails <em>by</em> Evelin</span>
      </a>
      <nav className="nav-desktop" aria-label="Fő navigáció">
        {links.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
      </nav>
      <a className="btn btn-small header-cta" href="#idopont">Időpontfoglalás</a>
      <button className="burger" type="button" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'Menü bezárása' : 'Menü megnyitása'} onClick={() => setOpen((value) => !value)}>
        <span /><span />
      </button>
      <div className="mobile-menu" id="mobile-menu" aria-hidden={!open} inert={!open}>
        <nav aria-label="Mobil navigáció">
          {links.map(([href, label], index) => (
            <a key={href} href={href} style={{ '--i': index } as React.CSSProperties} onClick={() => setOpen(false)}>
              <small>0{index + 1}</small>{label}
            </a>
          ))}
        </nav>
        <a className="btn btn-primary mobile-menu-cta" href="#idopont" onClick={() => setOpen(false)}>Időpontot foglalok</a>
      </div>
    </header>
  )
}
