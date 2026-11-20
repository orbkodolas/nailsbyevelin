import { useEffect, useRef, useState } from 'react'
import { getLenis, reducedMotion } from '../lib/motion'

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
  const menuRef = useRef<HTMLDivElement>(null)
  const burgerRef = useRef<HTMLButtonElement>(null)
  const clipAnim = useRef<Animation | null>(null)
  const wasOpened = useRef(false)

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
    setHidden(false) // különben a zárás első képkockáján a header transformja félreugratná a fixed menüt
    getLenis()?.stop()
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => { getLenis()?.start(); document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [open])

  // Kör-maszk animáció (WAAPI): nyitás a burger közepéből, zárás vissza oda (a nyitás tükre).
  // A CSS végállapotok (zárt: 0 sugár, nyitott: teljes fedés) vizuálisan azonosak az animációk végpontjaival,
  // így a befejezéskor nincs ugrás; megszakításkor az aktuális (animált) értékről folytatjuk.
  useEffect(() => {
    const menu = menuRef.current
    const burger = burgerRef.current
    if (!menu || !burger) return
    if (open) wasOpened.current = true
    else if (!wasOpened.current) return
    const running = clipAnim.current?.playState === 'running' ? clipAnim.current : null
    const current = running ? getComputedStyle(menu).clipPath : ''
    clipAnim.current?.cancel()
    clipAnim.current = null
    if (reducedMotion()) return
    let keyframes: Keyframe[]
    let options: KeyframeAnimationOptions
    const m = menu.getBoundingClientRect()
    const b = burger.getBoundingClientRect()
    const x = b.left + b.width / 2 - m.left
    const y = b.top + b.height / 2 - m.top
    const at = `at ${x}px ${y}px`
    // Pontosan a legtávolabbi sarokig érő sugár: így a zárás első képkockájától látszik a zsugorodás
    const full = `circle(${Math.ceil(Math.hypot(Math.max(x, m.width - x), Math.max(y, m.height - y))) + 2}px ${at})`
    if (open) {
      keyframes = [{ clipPath: current || `circle(0px ${at})` }, { clipPath: full }]
      options = { duration: 450, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
    } else {
      // Vissza a burger közepébe; gyors, azonnal induló görbe, hogy az X→hamburger váltással együtt érjen véget
      keyframes = [
        { clipPath: current || full, visibility: 'visible' },
        { clipPath: `circle(0px ${at})`, visibility: 'visible' },
      ]
      options = { duration: 320, easing: 'cubic-bezier(0.33, 0, 0.2, 1)' }
    }
    const anim = menu.animate(keyframes, options)
    anim.onfinish = () => { if (clipAnim.current === anim) clipAnim.current = null }
    clipAnim.current = anim
  }, [open])

  useEffect(() => () => clipAnim.current?.cancel(), [])

  return (
    <header className={`site-header${scrolled ? ' is-scrolled' : ''}${hidden && !open ? ' is-hidden' : ''}${open ? ' is-open' : ''}`}>
      <a className="brand" href="#kezdo" aria-label="Nails by Evelin – főoldal" onClick={() => setOpen(false)}>
        <img src={`${import.meta.env.BASE_URL}images/logo-sm.webp`} width="44" height="44" alt="" />
        <span className="brand-name">Nails <em>by</em> Evelin</span>
      </a>
      <nav className="nav-desktop" aria-label="Fő navigáció">
        {links.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
      </nav>
      <a className="btn btn-small header-cta" href="#idopont">Időpontfoglalás</a>
      <button ref={burgerRef} className="burger" type="button" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'Menü bezárása' : 'Menü megnyitása'} onClick={() => setOpen((value) => !value)}>
        <span /><span />
      </button>
      <div ref={menuRef} className="mobile-menu" id="mobile-menu" aria-hidden={!open} inert={!open}>
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
