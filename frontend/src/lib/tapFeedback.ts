// Egységes, puha nyomás-visszajelzés minden kattintható elemen (érintés, egér, toll):
// lenyomásra finoman összehúzódik, elengedéskor simán visszanő. A CSS `scale` tulajdonságot animálja,
// így nem ütközik az elemek saját transform-animációival (GSAP, hover-emelés).
const SELECTOR = [
  'button', 'a[href]', '[role="button"]', 'summary', 'select', 'label',
  'input[type="checkbox"]', 'input[type="radio"]', 'input[type="submit"]', 'input[type="button"]', '.tap',
].join(', ')
const SKIP = ':disabled, [aria-disabled="true"], [data-no-tap]'
const MIN_PRESS_MS = 110

type Press = { anim: Animation; start: number }
const pressed = new Map<HTMLElement, Press>()

// Kis gomb erősebben, nagy kártya alig észrevehetően húzódik össze
const pressScale = (el: HTMLElement) => {
  const size = Math.max(el.offsetWidth, el.offsetHeight, 1)
  return Math.min(0.985, Math.max(0.94, 1 - 12 / size))
}

function release(el: HTMLElement) {
  const press = pressed.get(el)
  if (!press) return
  pressed.delete(el)
  const wait = Math.max(0, MIN_PRESS_MS - (performance.now() - press.start))
  window.setTimeout(() => {
    // Ha közben újra lenyomták, az új nyomás animációja már felette fut: a régit csak eltakarítjuk
    if (pressed.has(el)) { press.anim.cancel(); return }
    const current = getComputedStyle(el).scale
    press.anim.cancel()
    el.animate([{ scale: current && current !== 'none' ? current : '1' }, { scale: '1' }], { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
  }, wait)
}

export function initTapFeedback() {
  if (typeof Element.prototype.animate !== 'function' || !CSS.supports('scale', '1')) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

  const down = (event: PointerEvent) => {
    if (event.button !== 0 || reduced.matches || !(event.target instanceof Element)) return
    const el = event.target.closest<HTMLElement>(SELECTOR)
    if (!el || el.matches(SKIP) || pressed.has(el)) return
    const anim = el.animate([{ scale: '1' }, { scale: String(pressScale(el)) }], { duration: 140, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'forwards' })
    pressed.set(el, { anim, start: performance.now() })
  }
  const up = () => { for (const el of [...pressed.keys()]) release(el) }

  document.addEventListener('pointerdown', down, { passive: true })
  window.addEventListener('pointerup', up, { passive: true })
  window.addEventListener('pointercancel', up, { passive: true })
  window.addEventListener('blur', up)
  document.addEventListener('dragstart', up)
}
