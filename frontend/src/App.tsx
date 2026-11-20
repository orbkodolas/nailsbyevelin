import { useEffect, useRef } from 'react'
import { useRoute } from './lib/useRoute'
import { ScrollTrigger, getLenis, initSmoothScroll, scrollToTarget } from './lib/motion'
import { useScrollEffects } from './lib/useScrollEffects'
import { Cursor } from './components/Cursor'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Marquee } from './components/Marquee'
import { About } from './components/About'
import { Services } from './components/Services'
import { Gallery } from './components/Gallery'
import { Pricing } from './components/Pricing'
import { Ritual } from './components/Ritual'
import { Rules } from './components/Rules'
import { Voucher } from './components/Voucher'
import { Booking } from './components/Booking'
import { Footer } from './components/Footer'
import { ManageBooking } from './pages/ManageBooking'
import { VoucherThanks } from './pages/VoucherThanks'
import { Admin } from './pages/Admin'

function Home() {
  const root = useRef<HTMLDivElement>(null)
  useScrollEffects(root)

  useEffect(() => {
    // Betöltés után (betűtípusok, képek) a pozíciók újraszámolása
    const refresh = () => ScrollTrigger.refresh()
    document.fonts?.ready.then(refresh)
    window.addEventListener('load', refresh)
    const timer = window.setTimeout(refresh, 1200)
    // Közvetlen horgony-link (pl. /#arlista) megnyitásakor a megfelelő szekcióhoz görget
    const hash = window.location.hash
    const jump = hash && !hash.startsWith('#/') && document.querySelector(hash) ? window.setTimeout(() => { refresh(); scrollToTarget(hash, hash === '#kezdo' ? 0 : -72) }, 900) : 0
    return () => { window.removeEventListener('load', refresh); window.clearTimeout(timer); window.clearTimeout(jump) }
  }, [])

  return (
    <div ref={root}>
      <Header />
      <main>
        <Hero />
        <Marquee />
        <About />
        <Services />
        <Gallery />
        <Pricing />
        <Ritual />
        <Rules />
        <Voucher />
        <Booking />
      </main>
      <Footer />
    </div>
  )
}

export default function App() {
  const route = useRoute()

  useEffect(() => initSmoothScroll(), [])

  // Oldalon belüli horgonyok (#szolgaltatasok) finom görgetéssel; a #/… útvonalak a routert használják
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]')
      const href = link?.getAttribute('href')
      if (!link || !href || href === '#' || href.startsWith('#/') || event.defaultPrevented || event.metaKey || event.ctrlKey) return
      if (!document.querySelector(href)) return
      event.preventDefault()
      scrollToTarget(href, href === '#kezdo' ? 0 : -72)
      history.replaceState(null, '', href)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  // Útvonalváltáskor az oldal tetejére
  useEffect(() => {
    const lenis = getLenis()
    if (lenis) lenis.scrollTo(0, { immediate: true }); else window.scrollTo(0, 0)
  }, [route.name])

  return (
    <>
      <Cursor />
      {route.name === 'home' && <Home />}
      {route.name === 'manage' && <ManageBooking id={route.id} token={route.token} query={route.query} />}
      {route.name === 'voucher-thanks' && <VoucherThanks />}
      {route.name === 'admin' && <Admin />}
    </>
  )
}
