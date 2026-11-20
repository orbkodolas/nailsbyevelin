import type { ReactNode } from 'react'

// Egyszerű keret a nem főoldali oldalakhoz (foglalás kezelése, admin, köszönő oldal)
export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="page-shell">
      <header className="page-bar">
        <a className="brand" href="#/" aria-label="Nails by Evelin – főoldal"><img src="/images/logo-sm.webp" width="44" height="44" alt="" /><span className="brand-name">Nails <em>by</em> Evelin</span></a>
        <a className="btn-link" href="#/">← Főoldal</a>
      </header>
      <main className={`page-main${wide ? ' is-wide' : ''}`}>{children}</main>
    </div>
  )
}
