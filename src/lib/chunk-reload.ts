const RELOADED_KEY = "ledger:chunk-reload"

/** A page's code file is gone: the app was updated while this tab stayed open. */
export function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    message
  )
}

/**
 * Reloads once to pick up the new build. The flag stops a loop when the file is missing for some
 * other reason; it clears after a successful load.
 */
export function reloadForNewVersion() {
  try {
    if (sessionStorage.getItem(RELOADED_KEY)) return false
    sessionStorage.setItem(RELOADED_KEY, "1")
  } catch {
    return false
  }
  window.location.reload()
  return true
}

/** Call once the app has started: the last reload (if any) worked. */
export function clearReloadFlag() {
  window.setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOADED_KEY)
    } catch {
      // Storage blocked: nothing to clear.
    }
  }, 10_000)
}
