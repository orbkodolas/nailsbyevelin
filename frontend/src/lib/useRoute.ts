import { useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'manage'; id: string; token: string; query: URLSearchParams }
  | { name: 'admin' }
  | { name: 'voucher-thanks' }

export function parseRoute(hash: string): Route {
  if (!hash.startsWith('#/')) return { name: 'home' }
  const [path, search = ''] = hash.slice(1).split('?')
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'foglalas' && parts[1] && parts[2]) return { name: 'manage', id: parts[1], token: parts[2], query: new URLSearchParams(search) }
  if (parts[0] === 'admin') return { name: 'admin' }
  if (parts[0] === 'utalvany') return { name: 'voucher-thanks' }
  return { name: 'home' }
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
