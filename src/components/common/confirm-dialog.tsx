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
import {
  type ConfirmOptions,
  pendingConfirm,
  settleConfirm,
  subscribeConfirm,
} from "@/lib/confirm"

/** The dialog `confirmDialog` opens. Mount once near the root. */
export function ConfirmHost() {
  const current = useSyncExternalStore(subscribeConfirm, pendingConfirm)
  // Keep showing the last request while the dialog animates closed.
  const [shown, setShown] = useState<ConfirmOptions | null>(null)
  if (current && current !== shown) setShown(current)

  return (
    <AlertDialog
      open={!!current}
      onOpenChange={(open) => !open && settleConfirm(false)}
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
            onClick={() => settleConfirm(true)}
            autoFocus
          >
            {shown?.action ?? "Continue"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
