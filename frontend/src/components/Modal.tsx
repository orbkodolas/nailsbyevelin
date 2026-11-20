import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getLenis, reducedMotion } from '../lib/motion'

// Megegyezik a forms.css .modal átmenetének idejével
const DURATION = 300

// Újrahasznosítható dialógus: mobilon alulról felcsúszó sheet, desktopon középre igazított panel
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean }) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  // Nyitáskor azonnal a DOM-ba kerül (render közben állítjuk, nem effectben)
  if (open && !mounted) setMounted(true)

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // Belépés: előbb a DOM-ba kerül, majd a következő képkockában indul az animáció.
  // Kilépés: az animáció végéig marad a DOM-ban, utána unmountol.
  useEffect(() => {
    if (open) {
      const frame = window.requestAnimationFrame(() => setVisible(true))
      return () => window.cancelAnimationFrame(frame)
    }
    const timer = window.setTimeout(() => { setMounted(false); setVisible(false) }, reducedMotion() ? 0 : DURATION)
    return () => window.clearTimeout(timer)
  }, [open])

  // Görgetés zárolása, fókusz kezelése, Esc billentyű
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const lenis = getLenis()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    lenis?.stop()
    panel.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      lenis?.start()
      previous?.focus({ preventScroll: true })
    }
  }, [open])

  // Mobilon: lefelé húzással zárható (a fogantyútól/fejléctől bárhol, a tartalomból csak ha az a tetején áll)
  useEffect(() => {
    const el = panel.current
    if (!open || !el) return
    const body = el.querySelector<HTMLElement>('.modal-body')
    const mobile = window.matchMedia('(max-width: 759.98px)')
    let startY = 0
    let startT = 0
    let dy = 0
    let active = false
    let dragging = false
    const reset = () => { el.style.transition = ''; el.style.transform = '' }
    const onStart = (event: TouchEvent) => {
      active = event.touches.length === 1 && mobile.matches
      if (!active) return
      const fromBody = !!body && body.contains(event.target as Node)
      if (fromBody && body.scrollTop > 0) { active = false; return }
      dragging = false
      dy = 0
      startY = event.touches[0].clientY
      startT = performance.now()
    }
    const onMove = (event: TouchEvent) => {
      if (!active) return
      const delta = event.touches[0].clientY - startY
      if (!dragging) {
        if (delta === 0) return
        if (delta < 0) { active = false; return } // felfelé: natív görgetés
        dragging = true
        el.style.transition = 'none'
      }
      dy = Math.max(0, delta)
      el.style.transform = `translateY(${dy}px)`
      if (event.cancelable) event.preventDefault()
    }
    const onEnd = (event: TouchEvent) => {
      if (!active) return
      active = false
      if (!dragging) return
      dragging = false
      if (event.cancelable) event.preventDefault() // húzás után ne legyen kattintás a fogantyún
      const velocity = dy / Math.max(1, performance.now() - startT)
      reset() // a CSS átmenet viszi tovább: zárásnál le, egyébként vissza a helyére
      if (dy > Math.min(140, el.offsetHeight * 0.25) || (velocity > 0.5 && dy > 30)) onCloseRef.current()
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
      reset()
    }
  }, [open])

  if (!mounted) return null

  return createPortal(
    <div
      data-lenis-prevent
      className={`modal${open && visible ? ' is-open' : ''}${wide ? ' is-wide' : ''}`}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="modal-panel" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
        <button className="modal-grab" type="button" aria-label="Bezárás" onClick={onClose} />
        <div className="modal-head">
          {title && <h2 className="modal-title">{title}</h2>}
          <button className="modal-close" type="button" aria-label="Bezárás" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
