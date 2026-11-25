import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/**
 * A filter kept in the page's address (`?category=groceries`), so it survives a reload, the back
 * button and a shared link. The default value is left out of the URL. Values not in `allowed` (an
 * old or hand-edited link) fall back to the default.
 */
/** Search params changed earlier in the current tick, not yet in the address. */
let pending: URLSearchParams | null = null

export function useUrlState<T extends string>(key: string, fallback: T, allowed?: readonly T[]) {
  const [params, setParams] = useSearchParams()
  const raw = params.get(key)
  const value = raw !== null && (!allowed || allowed.includes(raw as T)) ? (raw as T) : fallback
  const set = useCallback(
    (next: T) => {
      // React Router builds each update from the URL as it is now, so two setters called in one
      // handler would each start from the old URL and only the last would stick. Changes made in
      // the same tick are gathered here instead, and each navigation carries all of them.
      const out = pending ?? new URLSearchParams(window.location.search)
      if (!pending) {
        pending = out
        queueMicrotask(() => (pending = null))
      }
      if (next === fallback || next === '') out.delete(key)
      else out.set(key, next)
      // Typing in a search box shouldn't fill the back button with every keystroke.
      setParams(new URLSearchParams(out), { replace: true, preventScrollReset: true })
    },
    [key, fallback, setParams],
  )
  return [value, set] as const
}
