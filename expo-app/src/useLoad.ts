import { useCallback, useEffect, useState } from 'react'
import { ApiError, errorText } from './api'

/** Betöltés + húzásra frissítés; 401-nél kilépteti a felhasználót. */
export function useLoad<T>(load: () => Promise<T>, onUnauthorized: () => void) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const reload = useCallback(async () => {
    setRefreshing(true)
    try {
      setData(await load())
      setError(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onUnauthorized()
      else setError(errorText(e))
    } finally {
      setRefreshing(false)
    }
  }, [load, onUnauthorized])

  useEffect(() => { reload() }, [reload])
  return { data, error, refreshing, reload }
}
