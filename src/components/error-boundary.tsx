import { AlertTriangle, RotateCw } from "lucide-react"
import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

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

interface Props {
  children: ReactNode
  /** Changing this (e.g. the current path) clears the error, so navigating away recovers. */
  resetKey?: string
  /** Fill the screen rather than the page area. */
  fullScreen?: boolean
}

interface State {
  error: Error | null
  resetKey?: string
}

/** Shows a "something went wrong" panel instead of a blank screen when a page throws while rendering. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(
    props: Props,
    state: State
  ): Partial<State> | null {
    if (props.resetKey !== state.resetKey)
      return { error: null, resetKey: props.resetKey }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error) && reloadForNewVersion()) return
    console.error(error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const updated = isChunkLoadError(error)
    return (
      <div
        className={
          this.props.fullScreen
            ? "flex min-h-svh items-center justify-center p-4"
            : "flex justify-center px-4 py-24"
        }
      >
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <h2 className="font-semibold">
            {updated ? "Ledger was updated" : "Something went wrong"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {updated
              ? "A newer version is available. Reload to keep going."
              : "This page hit an unexpected error. Reloading usually fixes it; your data is safe."}
          </p>
          <Button size="sm" onClick={() => window.location.reload()}>
            <RotateCw /> Reload
          </Button>
        </div>
      </div>
    )
  }
}
