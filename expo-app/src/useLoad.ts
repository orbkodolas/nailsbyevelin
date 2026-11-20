import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, errorText } from './api'

/**
 * Megosztott, a képernyők között megmaradó gyorsítótár (kulcs: a betöltő függvény).
 * Fülváltáskor nem kér le újra semmit, csak ha az adat régebbi, mint maxAgeMs; ugyanarra
 * az adatra egyszerre csak egy kérés fut (a Naptár és a Bevétel egy listán osztozik).
 */
type Entry = { data: unknown; at: number; inflight: Promise<unknown> | null; version: number; subs: Set<() => void> }
const cache = new Map<() => Promise<unknown>, Entry>()

function entryOf(load: () => Promise<unknown>) {
  let e = cache.get(load)
  if (!e) { e = { data: null, at: 0, inflight: null, version: 0, subs: new Set() }; cache.set(load, e) }
  return e
}
const notify = (e: Entry) => e.subs.forEach((fn) => fn())

function fetchEntry(load: () => Promise<unknown>) {
  const e = entryOf(load)
  if (e.inflight) return e.inflight
  const started = e.version
  e.inflight = load()
    .then((fresh) => {
      // Ha betöltés közben helyi módosítás történt, az elavult választ eldobjuk
      if (e.version === started) { e.data = fresh; e.at = Date.now(); notify(e) }
      return fresh
    })
    .finally(() => { e.inflight = null })
  return e.inflight
}

/** Csendes háttérfrissítés kérése bárhonnan (pl. ütközés után). */
export function invalidate(load: () => Promise<unknown>) { fetchEntry(load).catch(() => {}) }

/** Kilépéskor töröljük, hogy más kulccsal ne a régi adat jelenjen meg. */
export function clearCache() { cache.clear() }

/**
 * Betöltés + húzásra frissítés; 401-nél kilépteti a felhasználót.
 * mutate: a szerver válaszát azonnal beírja a helyi adatba; reload(true): csendes háttérfrissítés.
 */
export function useLoad<T>(load: () => Promise<T>, onUnauthorized: () => void, maxAgeMs = 5 * 60_000) {
  const entry = entryOf(load)
  const [data, setData] = useState<T | null>(entry.data as T | null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    const sync = () => setData(entryOf(load).data as T | null)
    const e = entryOf(load)
    e.subs.add(sync)
    sync()
    return () => { alive.current = false; e.subs.delete(sync) }
  }, [load])

  const reload = useCallback(async (silent?: unknown) => {
    const quiet = silent === true
    if (!quiet) setRefreshing(true)
    try {
      await fetchEntry(load)
      if (alive.current) setError(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onUnauthorized()
      else if (!quiet && alive.current) setError(errorText(e))
    } finally {
      if (!quiet && alive.current) setRefreshing(false)
    }
  }, [load, onUnauthorized])

  const mutate = useCallback((fn: (d: T) => T) => {
    const e = entryOf(load)
    if (e.data == null) return
    e.version++
    e.data = fn(e.data as T)
    notify(e)
  }, [load])

  // Induláskor (üres gyorsítótár) látható betöltés; ha van adat, csak elavultnál csendes frissítés
  useEffect(() => {
    const e = entryOf(load)
    if (e.data == null) reload()
    else if (Date.now() - e.at > maxAgeMs) reload(true)
  }, [load, reload, maxAgeMs])

  /** Csendes frissítés, de csak ha az adat régebbi a megadottnál (fókusz, időzítő). */
  const refreshIfOlder = useCallback((ms: number) => {
    if (Date.now() - entryOf(load).at > ms) reload(true)
  }, [load, reload])

  return { data, error, refreshing, reload, mutate, refreshIfOlder }
}
