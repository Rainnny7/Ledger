import { useState, useSyncExternalStore } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export interface ConfirmOptions {
  title: string
  description?: string
  /** The confirm button's label. */
  action?: string
  /** Red confirm button, for deleting and other things that can't be undone. */
  destructive?: boolean
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

let pending: Pending | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/**
 * Asks before doing something, in the app's own dialog instead of the browser's `confirm()`.
 * Resolves true when the person confirms. Needs `<ConfirmHost />` mounted once.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  pending?.resolve(false)
  return new Promise((resolve) => {
    pending = { ...options, resolve }
    emit()
  })
}

function settle(ok: boolean) {
  if (!pending) return
  pending.resolve(ok)
  pending = null
  emit()
}

export function ConfirmHost() {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => pending
  )
  // Keep showing the last request while the dialog animates closed.
  const [shown, setShown] = useState<ConfirmOptions | null>(null)
  if (current && current !== shown) setShown(current)

  return (
    <AlertDialog
      open={!!current}
      onOpenChange={(open) => !open && settle(false)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{shown?.title}</AlertDialogTitle>
          {shown?.description && (
            <AlertDialogDescription>{shown.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={shown?.destructive ? "destructive" : "default"}
            onClick={() => settle(true)}
            autoFocus
          >
            {shown?.action ?? "Continue"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
