import { useEffect, useRef, useState } from 'react'
import { useRoute, type Route } from './lib/useRoute'
import { ScrollTrigger, initSmoothScroll, scrollToTarget } from './lib/motion'
import { useScrollEffects } from './lib/useScrollEffects'
import { openBooking } from './lib/bookingModal'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Modal } from './components/Modal'
import { BookingModal } from './components/BookingModal'
import { About } from './components/About'
import { Services } from './components/Services'
import { Gallery } from './components/Gallery'
import { Pricing } from './components/Pricing'
import { Ritual } from './components/Ritual'
import { Rules } from './components/Rules'
import { Voucher } from './components/Voucher'
import { Booking } from './components/Booking'
import { Footer } from './components/Footer'
import { ChatBot } from './components/ChatBot'
import { ManageBooking } from './pages/ManageBooking'
import { VoucherThanks } from './pages/VoucherThanks'

function Home() {
  const root = useRef<HTMLDivElement>(null)
  useScrollEffects(root)

  useEffect(() => {
    // Betöltés után (betűtípusok, képek) a pozíciók újraszámolása
    const refresh = () => ScrollTrigger.refresh()
    document.fonts?.ready.then(refresh)
    window.addEventListener('load', refresh)
    const timer = window.setTimeout(refresh, 1200)
    // Közvetlen horgony-link (pl. /#arlista) megnyitásakor a megfelelő szekcióhoz görget; #idopont esetén a foglaló modál nyílik
    const hash = window.location.hash
    const jump = hash && !hash.startsWith('#/') && document.querySelector(hash) ? window.setTimeout(() => {
      refresh()
      if (hash === '#idopont') openBooking()
      else scrollToTarget(hash, hash === '#kezdo' ? 0 : -72)
    }, 900) : 0
    return () => { window.removeEventListener('load', refresh); window.clearTimeout(timer); window.clearTimeout(jump) }
  }, [])

  return (
    <div ref={root}>
      <Header />
      <main>
        <Hero />
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
  const { route, closeRoute } = useRoute()
  const isOverlay = route.name === 'manage' || route.name === 'voucher-thanks'
  // Záráskor a tartalom a kilépő animáció alatt megmarad
  const [lastOverlay, setLastOverlay] = useState<Route | null>(null)
  if (isOverlay && route !== lastOverlay) setLastOverlay(route)
  const overlay = isOverlay ? route : lastOverlay

  useEffect(() => initSmoothScroll(), [])

  // Oldalon belüli horgonyok (#szolgaltatasok) finom görgetéssel; a #/… útvonalak a routert használják
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]')
      const href = link?.getAttribute('href')
      if (!link || !href || href === '#' || href.startsWith('#/') || event.defaultPrevented || event.metaKey || event.ctrlKey) return
      // Időpontfoglalás: a foglaló modál nyílik, nem görgetés
      if (href === '#idopont') { event.preventDefault(); openBooking(); return }
      if (!document.querySelector(href)) return
      event.preventDefault()
      scrollToTarget(href, href === '#kezdo' ? 0 : -72)
      history.replaceState(null, '', href)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return (
    <>
      <Home />
      <BookingModal />
      <ChatBot />
      <Modal open={isOverlay} onClose={closeRoute} title={overlay?.name === 'voucher-thanks' ? 'Ajándékutalvány' : 'A foglalásod'}>
        {overlay?.name === 'manage' && <ManageBooking id={overlay.id} token={overlay.token} query={overlay.query} />}
        {overlay?.name === 'voucher-thanks' && <VoucherThanks />}
      </Modal>
    </>
  )
}
