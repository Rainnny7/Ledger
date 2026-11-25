import { useCallback, useEffect, useEffectEvent, useMemo } from "react"
import {
  type Options,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from "nuqs"

/**
 * How filters update the address: in place (typing in a search box shouldn't fill the back button
 * with every keystroke), without jumping the page to the top. nuqs batches every update made in
 * the same tick into one navigation, so several setters called together all stick.
 */
export const URL_OPTIONS = {
  history: "replace",
  scroll: false,
  clearOnDefault: true,
} as const satisfies Options

/**
 * A filter kept in the page's address (`?category=groceries`), so it survives a reload, the back
 * button and a shared link. The default value is left out of the URL. Values not in `allowed` (an
 * old or hand-edited link) fall back to the default.
 */
export function useUrlState<T extends string>(
  key: string,
  fallback: T,
  allowed?: readonly T[]
) {
  // `allowed` is usually written inline, so it's compared by its contents.
  const allowedKey = allowed?.join("\n")
  const parser = useMemo(
    () =>
      (allowedKey === undefined
        ? (parseAsString as unknown as ReturnType<
            typeof parseAsStringLiteral<T>
          >)
        : parseAsStringLiteral(allowedKey.split("\n") as T[])
      )
        .withDefault(fallback)
        .withOptions(URL_OPTIONS),
    [allowedKey, fallback]
  )
  const [value, setValue] = useQueryState(key, parser)
  const set = useCallback(
    (next: T) => void setValue(next === "" ? null : next),
    [setValue]
  )
  return [value as T, set] as const
}

/**
 * A one-off request in the address, like `?new=1` from the command palette: runs `run` with its
 * value once the page is `ready`, then drops it from the URL so a reload or the back button
 * doesn't open the dialog again.
 */
export function useIntent(
  key: string,
  run: (value: string) => void,
  ready = true
) {
  const [value, setValue] = useQueryState(key, URL_OPTIONS)
  const fire = useEffectEvent((v: string) => run(v))
  useEffect(() => {
    if (value === null || !ready) return
    fire(value)
    void setValue(null)
  }, [value, ready, setValue])
}
