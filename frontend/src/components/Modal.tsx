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

  if (!mounted) return null

  return createPortal(
    <div
      className={`modal${open && visible ? ' is-open' : ''}${wide ? ' is-wide' : ''}`}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="modal-panel" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
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
